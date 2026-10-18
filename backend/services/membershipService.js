const mongoose = require("mongoose");
const User = require("../src/models/User");
const UserProfile = require("../src/models/UserProfile.js");
const Wallet = require("../src/models/Wallet");
const MembershipPayment = require("../src/models/MembershipPayment");
const generateMembershipNumber = require("../src/utils/membershipNumber");
const { placeInMatrix } = require("../src/modules/auth/auth.service");
const C = require("../src/modules/config/activity");
const { PLANS, LEVELS, ROLLUP_MAX_STEPS, PERIOD_DAYS, RENEW_WINDOW_DAYS } = require("../src/modules/config/plans");


const PLATFORM_ID = process.env.PLATFORM_WALLET_USER_ID;
if (!PLATFORM_ID) throw new Error("Missing env PLATFORM_WALLET_USER_ID");
const DAY = 24 * 3600 * 1000;

class MembershipError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

async function debitWallet(userId, amount, ref, description, session) {
  const w = await Wallet.findOneAndUpdate(
    { userId, isFrozen: { $ne: true }, balance: { $gte: amount } }, // check + debit in one atomic step
    {
      $inc: { balance: -amount },
      $push: {
        transactions: {
          amount: -amount, type: "matrix_subscription", status: "COMPLETED",
          referenceId: ref, description,
        },
      },
    },
    { session }
  );
  if (!w) {
    const cur = await Wallet.findOne({ userId }).session(session).select("isFrozen balance").lean();
    if (!cur) throw new MembershipError("WALLET_NOT_FOUND", 404);
    if (cur.isFrozen) throw new MembershipError("WALLET_FROZEN", 403);
    throw new MembershipError("INSUFFICIENT_FUNDS", 402, { required: amount, currentBalance: cur.balance });
  }
}

async function creditWallet(userId, amount, type, ref, description, session) {
  if (amount <= 0) return;
  const w = await Wallet.findOneAndUpdate(
    { userId },
    {
      $inc: { balance: amount },
      $push: { transactions: { amount, type, status: "COMPLETED", referenceId: ref, description } },
    },
    { session }
  );
  if (!w) throw new MembershipError("PAYEE_WALLET_MISSING", 500);
}

/**
 * Roll-up rule. path = ancestors, root first. The ancestor at distance d is path[path.length - d].
 * For each level: try the ancestor at that level, then up to ROLLUP_MAX_STEPS further up.
 * No eligible ancestor found => the cut is breakage and goes to the company.
 */
function resolvePayouts(path, amount, eligible) {
  const rows = [];
  for (const { level, bp } of LEVELS) {
    const cut = Math.floor((amount * bp) / 10000);
    if (cut <= 0) continue;
    let row = { level, amount: cut, kind: "breakage", payeeId: PLATFORM_ID, steps: 0 };

    for (let step = 0; step <= ROLLUP_MAX_STEPS; step++) {
      const idx = path.length - (level + step);
      if (idx < 0) break; // ran out of ancestors
      const id = String(path[idx]);
      if (id === PLATFORM_ID) {
        row = { level, amount: cut, kind: "company", payeeId: PLATFORM_ID, steps: step };
        break;
      }
      const plan = PLANS[eligible.get(id)];
      if (plan && plan.earnDepth >= level) {
        row = { level, amount: cut, kind: step ? "rollup" : "commission", payeeId: id, steps: step };
        break;
      }
    }
    rows.push(row);
  }
  return rows;
}

/**
 * First payment = activation (matrix placement + membership number).
 * Later payments = 30-day renewals. Everything happens in ONE transaction.
 */
async function payMembership({ userId, planKey, idempotencyKey }) {
  const plan = PLANS[planKey];
  if (!plan) throw new MembershipError("INVALID_PLAN");
  if (String(userId) === PLATFORM_ID) throw new MembershipError("NOT_APPLICABLE", 400);

  try {
    return await mongoose.connection.transaction(async (session) => {
      const now = new Date();
      let user = await User.findById(userId).session(session);
      if (!user || user.accountCategory !== "network") throw new MembershipError("NOT_A_NETWORK_ACCOUNT", 403);
      if (!user.isActive || ["suspended", "cancelled"].includes(user.membershipStatus)) {
        throw new MembershipError("ACCOUNT_NOT_ELIGIBLE", 403);
      }

      const isActivation = user.membershipStatus === "pending";
      const expires = user.membershipExpiresAt;
      const running = !isActivation && expires && expires > now;
      if (running && expires - now > RENEW_WINDOW_DAYS * DAY) throw new MembershipError("NOT_DUE_YET", 409);

      const periodStart = running ? expires : now;
      const periodEnd = new Date(periodStart.getTime() + PERIOD_DAYS * DAY);
      const amount = plan.fee;

      // Unique indexes make a duplicate request fail right here, before any money moves
      const [pay] = await MembershipPayment.create(
        [{ userId, plan: planKey, amount, kind: isActivation ? "activation" : "renewal",
           periodStart, periodEnd, idempotencyKey, payouts: [] }],
        { session }
      );
      const ref = String(pay._id);

      await debitWallet(userId, amount, ref, `${plan.name} membership fee (Ksh ${amount}).`, session);

      // Matrix slot is taken only now, after payment (a failure here rolls the debit back too)
      if (isActivation) user = await placeInMatrix(userId, session);

      // ONE query finds every eligible ancestor that could be paid
      const path = user.pathFromRoot || [];
      const candidates = path.slice(-(LEVELS.length + ROLLUP_MAX_STEPS)).filter((id) => String(id) !== PLATFORM_ID);
      const found = await User.find({
        _id: { $in: candidates },
        accountCategory: "network",
        membershipStatus: "active",
        isActive: true,
        commissionEligible: true,
        membershipExpiresAt: { $gt: now },
      }).select("plan").session(session).lean();
      const eligible = new Map(found.map((r) => [String(r._id), r.plan]));

      const rows = resolvePayouts(path, amount, eligible);
      const levelCuts = rows.reduce((s, r) => s + r.amount, 0);
      const baseShare = amount - levelCuts; // the company's own share (45%)

      let commissionTotal = 0, companyTotal = baseShare, breakageTotal = 0;
      for (const r of rows) {
        if (r.kind === "commission" || r.kind === "rollup") {
          commissionTotal += r.amount;
          await creditWallet(
            r.payeeId, r.amount, "network_commission", ref,
            r.kind === "rollup"
              ? `Level ${r.level} commission (rolled up ${r.steps} step${r.steps > 1 ? "s" : ""}).`
              : `Level ${r.level} network commission.`,
            session
          );
        } else if (r.kind === "company") companyTotal += r.amount;
        else breakageTotal += r.amount;
      }
      // Safety invariant: every shilling debited is credited somewhere, exactly once
      if (commissionTotal + companyTotal + breakageTotal !== amount) throw new MembershipError("SPLIT_MISMATCH", 500);

      await creditWallet(PLATFORM_ID, companyTotal, "platform_revenue", ref, "Membership revenue share.", session);
      await creditWallet(PLATFORM_ID, breakageTotal, "breakage", ref, "Unclaimed commission (breakage).", session);

      await MembershipPayment.updateOne(
        { _id: pay._id },
        { $set: { payouts: [{ level: 0, payeeId: PLATFORM_ID, amount: baseShare, kind: "company", steps: 0 }, ...rows] } },
        { session }
      );

      const $set = { membershipStatus: "active", plan: planKey, membershipExpiresAt: periodEnd };
      if (isActivation) $set.membershipStartedAt = now;
      if (isActivation && C.GRACE_DAYS > 0) $set.commissionEligible = true; // grace period; the daily sweep takes over later
      await User.updateOne({ _id: userId }, { $set }, { session });

      if (isActivation) {
        const profile = await UserProfile.findOne({ userId }).session(session).select("membershipNumber");
        if (profile && !profile.membershipNumber) {
          const num = await generateMembershipNumber(); // gaps in the sequence are harmless
          await UserProfile.updateOne({ userId }, { $set: { membershipNumber: num } }, { session });
        }
      }

      return { ok: true, paymentId: pay._id, plan: planKey, amount, periodEnd, activated: isActivation };
    });
  } catch (e) {
    if (e.code === 11000) {
      const prior = await MembershipPayment.findOne({ userId, idempotencyKey }).lean();
      if (prior) return { ok: true, replay: true, paymentId: prior._id, plan: prior.plan, amount: prior.amount, periodEnd: prior.periodEnd };
      throw new MembershipError("PAYMENT_ALREADY_RECORDED", 409);
    }
    throw e;
  }
}

module.exports = { payMembership, resolvePayouts, MembershipError };
