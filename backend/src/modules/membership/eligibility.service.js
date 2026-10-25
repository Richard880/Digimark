const User = require("../../models/User");
const Wallet = require("../../models/Wallet");
const Product = require("../../models/Product");
const Order = require("../../models/Order");
const ActivityDay = require("../../models/ActivityDay");
const C = require("../config/activity");

const PLATFORM_ID = process.env.PLATFORM_WALLET_USER_ID;
if (!PLATFORM_ID) throw new Error("Missing env PLATFORM_WALLET_USER_ID");
const DAY = 24 * 3600 * 1000;

const toMap = (rows, key = "_id") => new Map(rows.map((r) => [String(r[key]), r.n]));
const get = (m, id) => m.get(String(id)) || 0;

/**
 * Judges a list of users (docs with _id, membershipStartedAt, membershipExpiresAt).
 * 6 database queries for the WHOLE batch, never one per member.
 * @returns Map<id string, { checks, values, score, eligible }>
 */
async function evaluateUsers(users, now = new Date()) {
  const ids = users.map((u) => u._id);
  const since = new Date(now.getTime() - C.WINDOW_DAYS * DAY);
  const sinceDay = C.dayKey(since);
  const orderMatch = {
    isEscrowReleased: true,
    deliveredAt: { $gte: since },
    settledBy: { $nin: ["auto", "admin"] },
    "financials.totalRetailPaid": { $gte: C.MIN_ORDER_AMOUNT },
  };

  const [growth, tx, prods, sold, bought, days] = await Promise.all([
    User.aggregate([
      { $match: { sponsorId: { $in: ids }, membershipStartedAt: { $gte: since } } },
      { $group: { _id: "$sponsorId", n: { $sum: 1 } } },
    ]),
    Wallet.aggregate([
      { $match: { userId: { $in: ids } } },
      {
        $project: {
          _id: 0,
          userId: 1,
          n: {
            $size: {
              $filter: {
                input: { $ifNull: ["$transactions", []] },
                as: "t",
                cond: {
                  $and: [
                    { $gte: ["$$t.createdAt", since] },
                    { $in: ["$$t.status", ["COMPLETED", "ESCROW_HELD"]] },
                    { $in: ["$$t.type", C.TX_TYPES] },
                    { $gte: [{ $abs: "$$t.amount" }, C.MIN_TX_AMOUNT] },
                  ],
                },
              },
            },
          },
        },
      },
    ]),
    Product.aggregate([
      { $match: { sellerId: { $in: ids }, createdAt: { $gte: since } } },
      { $group: { _id: "$sellerId", n: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...orderMatch, sellerId: { $in: ids } } },
      { $group: { _id: "$sellerId", n: { $sum: 1 } } },
    ]),
    Order.aggregate([
      { $match: { ...orderMatch, buyerId: { $in: ids } } },
      { $group: { _id: "$buyerId", n: { $sum: 1 } } },
    ]),
    ActivityDay.aggregate([
      { $match: { userId: { $in: ids }, day: { $gte: sinceDay } } },
      { $group: { _id: "$userId", n: { $sum: 1 } } },
    ]),
  ]);

  const gM = toMap(growth), tM = toMap(tx, "userId"), pM = toMap(prods);
  const sM = toMap(sold), bM = toMap(bought), dM = toMap(days);

  const out = new Map();
  for (const u of users) {
    const values = {
      growth: get(gM, u._id),
      transactions: get(tM, u._id),
      products: get(pM, u._id),
      deliveries: get(sM, u._id) + get(bM, u._id),
      activeDays: get(dM, u._id),
    };
    const checks = {
      growth: values.growth >= C.MIN_NEW_RECRUITS,
      transactions: values.transactions >= C.MIN_TRANSACTIONS,
      products: values.products >= C.MIN_PRODUCTS,
      deliveries: values.deliveries >= C.MIN_ORDERS,
      activeDays: values.activeDays >= C.MIN_ACTIVE_DAYS,
    };
    const score = Object.values(checks).filter(Boolean).length;
    const lapsed = !!(u.membershipExpiresAt && u.membershipExpiresAt <= now);
    const inGrace = !!(u.membershipStartedAt && now - u.membershipStartedAt < C.GRACE_DAYS * DAY);
    out.set(String(u._id), { checks, values, score, eligible: !lapsed && (score >= C.PASS_SCORE || inGrace), inGrace });
  }
  return out;
}

/**
 * Re-checks the stalest members first, in batches, until the time budget runs out.
 * Safe to run repeatedly: members checked recently are skipped, so an interrupted run resumes by itself.
 */
async function runEligibilitySweep(budgetMs) {
  const started = Date.now();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - C.STALE_HOURS * 3600 * 1000);
  const stats = { checked: 0, eligible: 0, ineligible: 0, finished: false };

  while (Date.now() - started < budgetMs) {
    const batch = await User.find({
      _id: { $ne: PLATFORM_ID },
      accountCategory: "network",
      membershipStatus: "active",
      $or: [{ eligibilityCheckedAt: null }, { eligibilityCheckedAt: { $lt: staleBefore } }],
    })
      .sort({ eligibilityCheckedAt: 1 })
      .limit(C.BATCH)
      .select("membershipStartedAt membershipExpiresAt")
      .lean();

    if (!batch.length) { stats.finished = true; break; }

    const results = await evaluateUsers(batch, now);
    await User.bulkWrite(
      batch.map((u) => {
        const r = results.get(String(u._id));
        stats[r.eligible ? "eligible" : "ineligible"]++;
        return {
          updateOne: {
            filter: { _id: u._id },
            update: { $set: { commissionEligible: r.eligible, activityScore: r.score, eligibilityCheckedAt: now } },
          },
        };
      }),
      { ordered: false }
    );
    stats.checked += batch.length;
  }
  return stats;
}

module.exports = { evaluateUsers, runEligibilitySweep };
