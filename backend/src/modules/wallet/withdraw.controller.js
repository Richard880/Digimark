const mongoose = require("mongoose");
const crypto = require("crypto");
const Wallet = require("../../models/Wallet");
const Withdrawal = require("../../models/Withdrawal");
const { darajaFetch, getAccessToken, normalizePhone, safeEq } = require("./wallet.controller");
const UserProfile = require("../../models/UserProfile.js");

// const REQUIRED_ENV = [
//   "MPESA_B2C_SHORTCODE", "MPESA_INITIATOR_NAME", "MPESA_INITIATOR_PASSWORD",
//   "MPESA_CERT_PEM", "MPESA_CALLBACK_BASE_URL", "MPESA_CALLBACK_SECRET",
// ];
// for (const k of REQUIRED_ENV) if (!process.env[k]) throw new Error(`Missing env ${k}`);
const REQUIRED_ENV = [
  "MPESA_B2C_SHORTCODE", "MPESA_INITIATOR_NAME", "MPESA_INITIATOR_PASSWORD",
  "MPESA_CERT_PEM", "MPESA_CALLBACK_BASE_URL", "MPESA_CALLBACK_SECRET",
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
const B2C_ENABLED = missingEnv.length === 0;
if (!B2C_ENABLED) console.warn(`⚠️  M-Pesa withdrawals are OFF. Missing: ${missingEnv.join(", ")}.`);

const MIN_WITHDRAW = 50;
const MAX_WITHDRAW = 150000; // single M-Pesa transaction ceiling
const DAILY_LIMIT = Number(process.env.WITHDRAW_DAILY_LIMIT) || 300000; // rolling 24h
const OPEN = ["PENDING_PAYOUT", "SUBMITTED"];
const SETTLEABLE = [...OPEN, "REVIEW"]; // a late callback may settle a REVIEW item

class WdError extends Error {
  constructor(code, status = 400, extra = {}) {
    super(code);
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

const view = (w) => ({ id: w._id, amount: w.amount, status: w.status, createdAt: w.createdAt });

// Safaricom wants the initiator password RSA-encrypted with their public certificate
function securityCredential() {
  const pem = process.env.MPESA_CERT_PEM.replace(/\\n/g, "\n");
  return crypto
    .publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(process.env.MPESA_INITIATOR_PASSWORD)
    )
    .toString("base64");
}

const cbUrl = (name) =>
  `${process.env.MPESA_CALLBACK_BASE_URL}/api/wallet/${name}/${process.env.MPESA_CALLBACK_SECRET}`;

// ---------- Settlement helpers (each can only win once) ----------
async function failWithdrawal(id, reason) {
  await mongoose.connection.transaction(async (session) => {
    const w = await Withdrawal.findOneAndUpdate(
      { _id: id, status: { $in: SETTLEABLE } },
      { $set: { status: "FAILED", failReason: String(reason).slice(0, 200) } },
      { new: true, session }
    );
    if (!w) return; // already completed or failed: nothing to refund

    // Refund even if frozen: the money was theirs
    const wallet = await Wallet.findOneAndUpdate(
      { userId: w.userId },
      {
        $inc: { balance: w.amount },
        $push: {
          transactions: {
            amount: w.amount,
            type: "receive_transfer",
            status: "COMPLETED",
            referenceId: String(w._id),
            description: `Withdrawal of Ksh ${w.amount.toLocaleString()} failed. Funds returned to your wallet.`,
          },
        },
      },
      { session }
    );
    if (!wallet) throw new Error("WALLET_MISSING_FOR_REFUND"); // aborts: stays unsettled

    // Separate update: MongoDB forbids $push and arrayFilters on the same array in one operation
    await Wallet.updateOne(
      { userId: w.userId },
      { $set: { "transactions.$[e].status": "FAILED" } },
      { session, arrayFilters: [{ "e.referenceId": String(w._id), "e.type": "withdrawal" }] }
    );
  });
  return Withdrawal.findById(id);
}

async function completeWithdrawal(id, receipt) {
  await mongoose.connection.transaction(async (session) => {
    const $set = { status: "COMPLETED", completedAt: new Date() };
    if (receipt) $set.mpesaReceipt = receipt;
    const w = await Withdrawal.findOneAndUpdate(
      { _id: id, status: { $in: SETTLEABLE } }, { $set }, { new: true, session }
    );
    if (!w) return;
    await Wallet.updateOne(
      { userId: w.userId },
      { $set: { "transactions.$[e].status": "COMPLETED" } },
      { session, arrayFilters: [{ "e.referenceId": String(w._id), "e.type": "withdrawal" }] }
    );
  });
  return Withdrawal.findById(id);
}

// Unclear outcome: keep the money debited and flag for a human. Never auto-refund here.
async function markReview(id, reason) {
  await Withdrawal.updateOne(
    { _id: id, status: { $in: OPEN } },
    { $set: { status: "REVIEW", failReason: String(reason).slice(0, 200) } }
  );
  return Withdrawal.findById(id);
}

// ---------- Send the payout (called after the debit has committed) ----------
async function dispatchPayout(w) {
  let token, credential;
  try {
    token = await getAccessToken();
    credential = securityCredential();
  } catch (e) {
    console.error("❌ B2C prep failed (nothing sent):", e.message);
    return failWithdrawal(w._id, "PAYOUT_SETUP_FAILED"); // definitely not sent
  }

  let r;
  try {
    r = await darajaFetch("/mpesa/b2c/v1/paymentrequest", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        OriginatorConversationID: w.originatorConversationId,
        InitiatorName: process.env.MPESA_INITIATOR_NAME,
        SecurityCredential: credential,
        CommandID: "BusinessPayment",
        Amount: w.amount,
        PartyA: process.env.MPESA_B2C_SHORTCODE,
        PartyB: w.phone,
        Remarks: "Sokodigi wallet withdrawal",
        QueueTimeOutURL: cbUrl("b2c-timeout"),
        ResultURL: cbUrl("b2c-result"),
        Occasion: String(w._id).slice(-12),
      }),
    });
  } catch (e) {
    console.error("❌ B2C request error (state unknown):", e.message);
    return markReview(w._id, "PAYOUT_REQUEST_UNKNOWN_STATE"); // may have been sent
  }

  const d = r.data || {};
  if (r.ok && String(d.ResponseCode) === "0") {
    // Filter on PENDING_PAYOUT so a fast result callback is never overwritten
    await Withdrawal.updateOne(
      { _id: w._id, status: "PENDING_PAYOUT" },
      { $set: { status: "SUBMITTED", conversationId: d.ConversationID } }
    );
    return Withdrawal.findById(w._id);
  }
  const definitelyRejected = (r.ok && d.ResponseCode !== undefined) || (r.status >= 400 && r.status < 500);
  console.error("❌ B2C rejected:", r.status, JSON.stringify(d));
  return definitelyRejected
    ? failWithdrawal(w._id, d.errorMessage || d.ResponseDescription || "PAYOUT_REJECTED")
    : markReview(w._id, "PAYOUT_PROVIDER_ERROR");
}

// ---------- POST /api/wallet/withdraw ----------
async function requestWithdrawal(req, res) {
  try {
    if (!B2C_ENABLED) return res.status(503).json({ error: "PAYOUTS_NOT_CONFIGURED" });
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const key = req.get("Idempotency-Key");
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(key || "")) {
      return res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED" });
    }
    const amount = req.body?.amount;
    if (!Number.isInteger(amount) || amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) {
      return res.status(400).json({ error: "INVALID_AMOUNT", min: MIN_WITHDRAW, max: MAX_WITHDRAW });
    }
    // Always the phone saved on the account, never one from the request
    const profile = await UserProfile.findOne({ userId }).select("phoneNumber").lean();
    const phone = normalizePhone(profile?.phoneNumber);
    if (!phone) return res.status(400).json({ error: "PAYOUT_PHONE_NOT_SET" });

    // Retry of a request we already handled: return it, send nothing
    const existing = await Withdrawal.findOne({ userId, idempotencyKey: key });
    if (existing) return res.status(200).json({ ok: true, withdrawal: view(existing) });

    const uid = new mongoose.Types.ObjectId(String(userId));
    let w;
    try {
      w = await mongoose.connection.transaction(async (session) => {
        const id = new mongoose.Types.ObjectId();

        // 1. Debit FIRST: check + debit is one atomic step, and it locks the wallet document
        const wallet = await Wallet.findOneAndUpdate(
          { userId: uid, isFrozen: { $ne: true }, balance: { $gte: amount } },
          {
            $inc: { balance: -amount },
            $push: {
              transactions: {
                amount: -amount,
                type: "withdrawal",
                status: "PENDING",
                referenceId: String(id),
                description: `Withdrawal of Ksh ${amount.toLocaleString()} to M-Pesa ${phone.slice(0, 6)}***${phone.slice(-2)}.`,
              },
            },
          },
          { new: true, session }
        );
        if (!wallet) {
          const cur = await Wallet.findOne({ userId: uid }).session(session);
          if (!cur) throw new WdError("WALLET_NOT_FOUND", 404);
          if (cur.isFrozen) throw new WdError("WALLET_FROZEN", 403);
          throw new WdError("INSUFFICIENT_FUNDS", 402, { currentBalance: cur.balance });
        }

        // 2. Daily limit, checked AFTER the debit: concurrent requests serialize on the wallet lock
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const agg = await Withdrawal.aggregate([
          { $match: { userId: uid, createdAt: { $gte: since }, status: { $ne: "FAILED" } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).session(session);
        const used = agg[0]?.total || 0;
        if (used + amount > DAILY_LIMIT) {
          throw new WdError("DAILY_LIMIT_EXCEEDED", 429, { remaining: Math.max(0, DAILY_LIMIT - used) });
        }

        const [doc] = await Withdrawal.create(
          [{
            _id: id, userId: uid, amount, phone, idempotencyKey: key,
            originatorConversationId: crypto.randomUUID(),
          }],
          { session }
        );
        return doc;
      });
    } catch (e) {
      if (e.code === 11000) { // same key arrived twice at the same moment
        const ex = await Withdrawal.findOne({ userId, idempotencyKey: key });
        if (ex) return res.status(200).json({ ok: true, withdrawal: view(ex) });
        return res.status(409).json({ error: "REQUEST_IN_PROGRESS" });
      }
      throw e;
    }

    const settled = await dispatchPayout(w);
    return res.status(202).json({ ok: true, withdrawal: view(settled || w) });
  } catch (err) {
    if (err instanceof WdError) {
      const { code, status, message, stack, ...extra } = err;
      return res.status(status).json({ error: code, ...extra });
    }
    console.error("❌ requestWithdrawal:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/b2c-result/:secret : Safaricom, no user auth ----------
async function b2cResult(req, res) {
  if (!B2C_ENABLED) return res.sendStatus(404);
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    if (!safeEq(req.params.secret || "", process.env.MPESA_CALLBACK_SECRET)) return res.sendStatus(404);
    const r = req.body?.Result;
    if (!r || typeof r.OriginatorConversationID !== "string") return ack();

    const w = await Withdrawal.findOne({ originatorConversationId: r.OriginatorConversationID });
    if (!w || !SETTLEABLE.includes(w.status)) return ack(); // unknown or already settled

    if (Number(r.ResultCode) === 0) {
      const params = r.ResultParameters?.ResultParameter || [];
      const pick = (k) => params.find((p) => p.Key === k)?.Value;
      const paid = pick("TransactionAmount");
      if (paid !== undefined && Number(paid) !== w.amount) {
        console.error("🚨 B2C amount mismatch", String(w._id));
        await markReview(w._id, "AMOUNT_MISMATCH");
        return ack();
      }
      const receipt = typeof (r.TransactionID || pick("TransactionReceipt")) === "string"
        ? (r.TransactionID || pick("TransactionReceipt")) : null;
      await completeWithdrawal(w._id, receipt);
    } else {
      await failWithdrawal(w._id, r.ResultDesc || "PAYOUT_FAILED"); // refunds exactly once
    }
    return ack();
  } catch (err) {
    console.error("❌ b2cResult:", err.stack || err.message);
    return ack();
  }
}

// Queue timeout: outcome unknown, so hold the funds and flag for review. Do NOT refund.
async function b2cTimeout(req, res) {
  if (!B2C_ENABLED) return res.sendStatus(404);
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    if (!safeEq(req.params.secret || "", process.env.MPESA_CALLBACK_SECRET)) return res.sendStatus(404);
    const id = req.body?.Result?.OriginatorConversationID;
    if (typeof id === "string") {
      const w = await Withdrawal.findOne({ originatorConversationId: id });
      if (w) await markReview(w._id, "QUEUE_TIMEOUT");
    }
    return ack();
  } catch (err) {
    console.error("❌ b2cTimeout:", err.stack || err.message);
    return ack();
  }
}

// ---------- GET /api/wallet/withdrawals : own history ----------
async function listWithdrawals(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const rows = await Withdrawal.find({ userId })
      .sort({ createdAt: -1 }).limit(20)
      .select("amount status createdAt completedAt").lean();
    return res.json({ ok: true, withdrawals: rows });
  } catch (err) {
    console.error("❌ listWithdrawals:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}


module.exports = { requestWithdrawal, b2cResult, b2cTimeout, listWithdrawals, completeWithdrawal, failWithdrawal };
