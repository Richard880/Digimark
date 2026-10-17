const mongoose = require("mongoose");
const crypto = require("crypto");
const Wallet = require("../../models/Wallet");
const MpesaTopUp = require("../../models/MpesaTopUp");

// ---------- Config (the app refuses to start if anything is missing) ----------
const REQUIRED_ENV = [
  "MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE",
  "MPESA_PASSKEY", "MPESA_CALLBACK_BASE_URL", "MPESA_CALLBACK_SECRET",
];
for (const k of REQUIRED_ENV) if (!process.env[k]) throw new Error(`Missing env ${k}`);
if (process.env.MPESA_CALLBACK_SECRET.length < 24) throw new Error("MPESA_CALLBACK_SECRET too short");

const PROD = process.env.MPESA_ENV === "production";
const BASE = PROD ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
// Paybill = CustomerPayBillOnline, Till = CustomerBuyGoodsOnline
const TXN_TYPE = process.env.MPESA_TXN_TYPE || "CustomerPayBillOnline";
const MIN_TOPUP = 10;
const MAX_TOPUP = 150000; // M-Pesa single-transaction ceiling

const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- Daraja client ----------
async function darajaFetch(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BASE + path, { ...options, signal: ctrl.signal });
    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ok: r.ok, status: r.status, data };
  } finally {
    clearTimeout(timer);
  }
}

let tokenCache = { value: null, expires: 0 };
async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expires) return tokenCache.value;
  const basic = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");
  const { ok, data } = await darajaFetch("/oauth/v1/generate?grant_type=client_credentials", {
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!ok || !data.access_token) throw new Error("DARAJA_AUTH_FAILED");
  tokenCache = { value: data.access_token, expires: Date.now() + (Number(data.expires_in) - 60) * 1000 };
  return tokenCache.value;
}

function darajaTimestamp() {
  // YYYYMMDDHHmmss, Nairobi time (UTC+3)
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().replace(/\D/g, "").slice(0, 14);
}
function stkPassword(ts) {
  return Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${ts}`).toString("base64");
}

function normalizePhone(raw) {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  if (/^254[17]\d{8}$/.test(p)) return p;
  return null;
}

async function stkPush({ phone, amount, accountRef }) {
  const token = await getAccessToken();
  const ts = darajaTimestamp();
  // Keep "mpesa"/"safaricom" out of this URL path: Safaricom rejects callback URLs containing them.
  const callbackUrl = `${process.env.MPESA_CALLBACK_BASE_URL}/api/wallet/pay-callback/${process.env.MPESA_CALLBACK_SECRET}`;
  return darajaFetch("/mpesa/stkpush/v1/processrequest", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: stkPassword(ts),
      Timestamp: ts,
      TransactionType: TXN_TYPE,
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: accountRef.slice(0, 12),
      TransactionDesc: "Sokodigi wallet top-up",
    }),
  });
}

// Authoritative check: asks Safaricom directly, never trusts the callback body alone
async function stkQuery(checkoutRequestId) {
  const token = await getAccessToken();
  const ts = darajaTimestamp();
  const { data } = await darajaFetch("/mpesa/stkpushquery/v1/query", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: stkPassword(ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
  });
  // Daraja answers with an error while the payment is still being processed
  if (data.errorCode) return { state: "PENDING", desc: data.errorMessage };
  if (data.ResultCode === undefined) return { state: "PENDING", desc: "No result yet" };
  if (String(data.ResultCode) === "0") return { state: "SUCCESS", desc: data.ResultDesc };
  return { state: "FAILED", desc: String(data.ResultDesc || "Payment not completed").slice(0, 200) };
}

// ---------- Crediting (exactly once) ----------
async function creditTopUp(checkoutRequestId, receipt) {
  return mongoose.connection.transaction(async (session) => {
    // The status flip is the lock: a retried callback finds COMPLETED and does nothing
    const $set = { status: "COMPLETED", completedAt: new Date() };
    if (receipt) $set.mpesaReceipt = receipt;
    const t = await MpesaTopUp.findOneAndUpdate(
      { checkoutRequestId, status: "PENDING" },
      { $set },
      { new: true, session }
    );
    if (!t) return null;

    // Credits even if frozen: the user already paid. Freezing blocks spending and withdrawing.
    const w = await Wallet.findOneAndUpdate(
      { userId: t.userId },
      {
        $inc: { balance: t.amount },
        $push: {
          transactions: {
            amount: t.amount,
            type: "deposit",
            status: "COMPLETED",
            referenceId: receipt || checkoutRequestId,
            description: `M-Pesa top-up of Ksh ${t.amount.toLocaleString()}${receipt ? ` (${receipt})` : ""}.`,
          },
        },
      },
      { session }
    );
    if (!w) throw new Error("WALLET_MISSING_FOR_TOPUP"); // aborts: topup stays PENDING
    return t;
  });
}

// ---------- GET /api/wallet/my-balance ----------
async function getMyWalletDetails(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    // Last 30 entries only. The whole history is never loaded.
    const find = () => Wallet.findOne({ userId }).select({ transactions: { $slice: -30 } }).lean();
    let wallet = await find();
    if (!wallet) {
      // Better: create the wallet at signup. This fallback is safe against double-creation.
      try {
        await Wallet.create({ userId, balance: 0, escrowBalance: 0, transactions: [] });
      } catch (e) {
        if (e.code !== 11000) throw e;
      }
      wallet = await find();
    }

    return res.status(200).json({
      ok: true,
      balance: wallet.balance,
      escrowBalance: wallet.escrowBalance,
      isFrozen: !!wallet.isFrozen,
      transactions: [...(wallet.transactions || [])].reverse(),
    });
  } catch (err) {
    console.error("❌ getMyWalletDetails:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/mpesa-topup : starts the STK push, credits NOTHING ----------
async function handleMpesaTopUp(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const amount = req.body?.amount;
    if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      return res.status(400).json({ error: "INVALID_AMOUNT", min: MIN_TOPUP, max: MAX_TOPUP });
    }
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return res.status(400).json({ error: "INVALID_PHONE" });

    const wallet = await Wallet.findOne({ userId }).select("isFrozen").lean();
    if (!wallet) return res.status(404).json({ error: "WALLET_NOT_FOUND" });
    if (wallet.isFrozen) return res.status(403).json({ error: "WALLET_FROZEN" });

    // Stop double-taps: one open request per minute
    const recent = await MpesaTopUp.exists({
      userId, status: "PENDING", createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });
    if (recent) return res.status(429).json({ error: "TOPUP_ALREADY_IN_PROGRESS" });

    const { data } = await stkPush({ phone, amount, accountRef: `SKD${String(userId).slice(-6)}` });
    if (String(data.ResponseCode) !== "0" || !data.CheckoutRequestID) {
      console.error("❌ STK push rejected:", JSON.stringify(data));
      return res.status(502).json({ error: "PAYMENT_PROVIDER_REJECTED" });
    }

    await MpesaTopUp.create({
      userId, phone, amount,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
    });

    return res.status(202).json({
      ok: true,
      message: "Check your phone and enter your M-Pesa PIN.",
      checkoutRequestId: data.CheckoutRequestID, // poll the status endpoint with this
    });
  } catch (err) {
    console.error("❌ handleMpesaTopUp:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/pay-callback/:secret : called by Safaricom, no user auth ----------
async function mpesaCallback(req, res) {
  const ack = () => res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });
  try {
    if (!safeEq(req.params.secret || "", process.env.MPESA_CALLBACK_SECRET)) return res.sendStatus(404);

    const cb = req.body?.Body?.stkCallback;
    if (!cb || typeof cb.CheckoutRequestID !== "string") return ack();

    const topup = await MpesaTopUp.findOne({ checkoutRequestId: cb.CheckoutRequestID });
    if (!topup) return ack(); // unknown request: ignore

    const items = cb.CallbackMetadata?.Item || [];
    const pick = (name) => items.find((i) => i.Name === name)?.Value;
    const receipt = pick("MpesaReceiptNumber");

    if (topup.status !== "PENDING") {
      // Already settled (e.g. by the status endpoint): just record the receipt if we lack it
      if (topup.status === "COMPLETED" && !topup.mpesaReceipt && typeof receipt === "string") {
        await MpesaTopUp.updateOne({ _id: topup._id }, { $set: { mpesaReceipt: receipt } }).catch(() => {});
      }
      return ack();
    }

    if (Number(cb.ResultCode) !== 0) {
      await MpesaTopUp.updateOne(
        { _id: topup._id, status: "PENDING" },
        { $set: { status: "FAILED", failReason: String(cb.ResultDesc || "Failed").slice(0, 200) } }
      );
      return ack();
    }

    // Success claimed. Check the amount against what WE requested.
    if (Number(pick("Amount")) !== topup.amount || typeof receipt !== "string") {
      console.error("🚨 Top-up amount/receipt mismatch", topup._id);
      await MpesaTopUp.updateOne({ _id: topup._id, status: "PENDING" }, { $set: { status: "REVIEW" } });
      return ack();
    }

    // Don't trust the callback alone: confirm with Safaricom
    const q = await stkQuery(topup.checkoutRequestId);
    if (q.state === "SUCCESS") await creditTopUp(topup.checkoutRequestId, receipt);
    // anything else stays PENDING and is settled by the status endpoint / a reconciliation job
    return ack();
  } catch (err) {
    console.error("❌ mpesaCallback:", err.stack || err.message);
    return ack(); // never leak errors to the caller; reconciliation covers misses
  }
}

// ---------- GET /api/wallet/topup/:checkoutRequestId/status : owner only ----------
async function getTopUpStatus(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    const id = req.params.checkoutRequestId;
    if (typeof id !== "string" || id.length > 80) return res.status(400).json({ error: "INVALID_ID" });

    let topup = await MpesaTopUp.findOne({ checkoutRequestId: id, userId });
    if (!topup) return res.status(404).json({ error: "TOPUP_NOT_FOUND" });

    if (topup.status === "PENDING") {
      const q = await stkQuery(id);
      if (q.state === "SUCCESS") await creditTopUp(id, null);
      else if (q.state === "FAILED") {
        await MpesaTopUp.updateOne({ _id: topup._id, status: "PENDING" },
          { $set: { status: "FAILED", failReason: q.desc } });
      }
      topup = await MpesaTopUp.findById(topup._id);
    }
    return res.json({ ok: true, status: topup.status, amount: topup.amount });
  } catch (err) {
    console.error("❌ getTopUpStatus:", err.stack || err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// allocateEscrowFunds is gone: escrow lives in escrow.service.js (holdOrderFunds)
module.exports = { getMyWalletDetails, handleMpesaTopUp, mpesaCallback, getTopUpStatus };
