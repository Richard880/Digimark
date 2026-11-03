const mongoose = require("mongoose");
const crypto = require("crypto");
const Wallet = require("../../models/Wallet");
const MpesaTopUp = require("../../models/MpesaTopUp");

// ---------- Config ----------
const REQUIRED_ENV = [
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "MPESA_CALLBACK_BASE_URL",
  "MPESA_CALLBACK_SECRET",
];

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (
  process.env.MPESA_CALLBACK_SECRET &&
  process.env.MPESA_CALLBACK_SECRET.length < 24
) {
  missingEnv.push("MPESA_CALLBACK_SECRET (needs 24+ characters)");
}

const MPESA_ENABLED = missingEnv.length === 0;

if (!MPESA_ENABLED) {
  console.warn(
    `⚠️ M-Pesa is OFF. Missing: ${missingEnv.join(", ")}. Top-ups are disabled until these are set.`
  );
}

const PROD = process.env.MPESA_ENV === "production";
const BASE = PROD
  ? "https://api.safaricom.co.ke"
  : "https://sandbox.safaricom.co.ke";

const TXN_TYPE = process.env.MPESA_TXN_TYPE || "CustomerPayBillOnline";
const MIN_TOPUP = 10;
const MAX_TOPUP = 150000;

const safeEq = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));

  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/*
 * Authentication ID: MongoDB User._id
 * Generated/public ID: "SDK-001001"
 *
 * Keep these separate. Use mongoUserId only if your wallet/top-up
 * schemas store MongoDB ObjectIds. Use generatedUserId if those
 * schemas store strings like "SDK-001001".
 */
function getAuthenticatedUser(req) {
  const mongoUserId = req.user?._id;
  const generatedUserId = req.user?.userId;

  if (!mongoUserId || !mongoose.isValidObjectId(mongoUserId)) {
    return null;
  }

  if (
    typeof generatedUserId !== "string" ||
    generatedUserId.trim().length === 0
  ) {
    return null;
  }

  return {
    mongoUserId: new mongoose.Types.ObjectId(mongoUserId),
    generatedUserId: generatedUserId.trim(),
  };
}

// ---------- Daraja client ----------
async function darajaFetch(path, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);

  try {
    const response = await fetch(BASE + path, {
      ...options,
      signal: ctrl.signal,
    });

    const text = await response.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    return { ok: response.ok, status: response.status, data };
  } finally {
    clearTimeout(timer);
  }
}

let tokenCache = { value: null, expires: 0 };

async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expires) {
    return tokenCache.value;
  }

  const basic = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const { ok, data } = await darajaFetch(
    "/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: { Authorization: `Basic ${basic}` },
    }
  );

  if (!ok || !data.access_token) {
    throw new Error("DARAJA_AUTH_FAILED");
  }

  tokenCache = {
    value: data.access_token,
    expires: Date.now() + (Number(data.expires_in) - 60) * 1000,
  };

  return tokenCache.value;
}

function darajaTimestamp() {
  return new Date(Date.now() + 3 * 3600 * 1000)
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
}

function stkPassword(timestamp) {
  return Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");
}

function normalizePhone(raw) {
  const phone = String(raw || "").replace(/[\s+-]/g, "");

  if (/^0[17]\d{8}$/.test(phone)) {
    return "254" + phone.slice(1);
  }

  if (/^254[17]\d{8}$/.test(phone)) {
    return phone;
  }

  return null;
}

async function stkPush({ phone, amount, accountRef }) {
  const token = await getAccessToken();
  const timestamp = darajaTimestamp();

  const callbackUrl =
    `${process.env.MPESA_CALLBACK_BASE_URL}` +
    `/api/wallet/pay-callback/${process.env.MPESA_CALLBACK_SECRET}`;

  return darajaFetch("/mpesa/stkpush/v1/processrequest", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: stkPassword(timestamp),
      Timestamp: timestamp,
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

async function stkQuery(checkoutRequestId) {
  const token = await getAccessToken();
  const timestamp = darajaTimestamp();

  const { data } = await darajaFetch("/mpesa/stkpushquery/v1/query", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: stkPassword(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  if (data.errorCode) {
    return { state: "PENDING", desc: data.errorMessage };
  }

  if (data.ResultCode === undefined) {
    return { state: "PENDING", desc: "No result yet" };
  }

  if (String(data.ResultCode) === "0") {
    return { state: "SUCCESS", desc: data.ResultDesc };
  }

  return {
    state: "FAILED",
    desc: String(data.ResultDesc || "Payment not completed").slice(0, 200),
  };
}

// ---------- Crediting (exactly once) ----------
async function creditTopUp(checkoutRequestId, receipt) {
  return mongoose.connection.transaction(async (session) => {
    const set = {
      status: "COMPLETED",
      completedAt: new Date(),
    };

    if (receipt) {
      set.mpesaReceipt = receipt;
    }

    const topup = await MpesaTopUp.findOneAndUpdate(
      { checkoutRequestId, status: "PENDING" },
      { $set: set },
      { new: true, session }
    );

    if (!topup) {
      return null;
    }

    // Generated ID, e.g. SDK-001001, stored in Wallet.userId.
    const wallet = await Wallet.findOneAndUpdate(
      { userId: topup.userId },
      {
        $inc: { balance: topup.amount },
        $push: {
          transactions: {
            amount: topup.amount,
            type: "deposit",
            status: "COMPLETED",
            referenceId: receipt || checkoutRequestId,
            description:
              `M-Pesa top-up of Ksh ${topup.amount.toLocaleString()}` +
              `${receipt ? ` (${receipt})` : ""}.`,
          },
        },
      },
      { session, new: true }
    );

    if (!wallet) {
      throw new Error("WALLET_MISSING_FOR_TOPUP");
    }

    return topup;
  });
}

// ---------- GET /api/wallet/my-balance ----------
async function getMyWalletDetails(req, res) {
  try {
    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // Wallet.userId stores the generated string ID, e.g. SDK-001001.
    const generatedUserId = user.generatedUserId;

    const findWallet = () =>
      Wallet.findOne({ userId: generatedUserId })
        .select({ transactions: { $slice: -30 } })
        .lean();

    let wallet = await findWallet();

    if (!wallet) {
      try {
        await Wallet.create({
          userId: generatedUserId,
          balance: 0,
          escrowBalance: 0,
          transactions: [],
        });
      } catch (error) {
        if (error.code !== 11000) {
          throw error;
        }
      }

      wallet = await findWallet();
    }

    if (!wallet) {
      return res.status(404).json({ error: "WALLET_NOT_FOUND" });
    }

    return res.status(200).json({
      ok: true,
      userId: generatedUserId,
      balance: wallet.balance,
      escrowBalance: wallet.escrowBalance,
      isFrozen: !!wallet.isFrozen,
      transactions: [...(wallet.transactions || [])].reverse(),
    });
  } catch (error) {
    console.error("❌ getMyWalletDetails:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/mpesa-topup ----------
async function handleMpesaTopUp(req, res) {
  try {
    if (!MPESA_ENABLED) {
      return res.status(503).json({ error: "MPESA_NOT_CONFIGURED" });
    }

    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const generatedUserId = user.generatedUserId;
    const amount = req.body?.amount;

    if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      return res.status(400).json({
        error: "INVALID_AMOUNT",
        min: MIN_TOPUP,
        max: MAX_TOPUP,
      });
    }

    const phone = normalizePhone(req.body?.phone);

    if (!phone) {
      return res.status(400).json({ error: "INVALID_PHONE" });
    }

    const wallet = await Wallet.findOne({ userId: generatedUserId })
      .select("isFrozen")
      .lean();

    if (!wallet) {
      return res.status(404).json({ error: "WALLET_NOT_FOUND" });
    }

    if (wallet.isFrozen) {
      return res.status(403).json({ error: "WALLET_FROZEN" });
    }

    const recent = await MpesaTopUp.exists({
      userId: generatedUserId,
      status: "PENDING",
      createdAt: { $gt: new Date(Date.now() - 60 * 1000) },
    });

    if (recent) {
      return res.status(429).json({ error: "TOPUP_ALREADY_IN_PROGRESS" });
    }

    const accountRef = generatedUserId;
    const { data } = await stkPush({ phone, amount, accountRef });

    if (String(data.ResponseCode) !== "0" || !data.CheckoutRequestID) {
      console.error("❌ STK push rejected:", JSON.stringify(data));
      return res.status(502).json({ error: "PAYMENT_PROVIDER_REJECTED" });
    }

    await MpesaTopUp.create({
      userId: generatedUserId,
      phone,
      amount,
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
    });

    return res.status(202).json({
      ok: true,
      message: "Check your phone and enter your M-Pesa PIN.",
      checkoutRequestId: data.CheckoutRequestID,
    });
  } catch (error) {
    console.error("❌ handleMpesaTopUp:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/pay-callback/:secret ----------
async function mpesaCallback(req, res) {
  const ack = () =>
    res.status(200).json({
      ResultCode: 0,
      ResultDesc: "Accepted",
    });

  try {
    if (!MPESA_ENABLED) {
      return res.sendStatus(404);
    }

    if (
      !safeEq(req.params.secret || "", process.env.MPESA_CALLBACK_SECRET)
    ) {
      return res.sendStatus(404);
    }

    const callback = req.body?.Body?.stkCallback;

    if (!callback || typeof callback.CheckoutRequestID !== "string") {
      return ack();
    }

    const topup = await MpesaTopUp.findOne({
      checkoutRequestId: callback.CheckoutRequestID,
    });

    if (!topup) {
      return ack();
    }

    const items = callback.CallbackMetadata?.Item || [];
    const pick = (name) => items.find((item) => item.Name === name)?.Value;
    const receipt = pick("MpesaReceiptNumber");

    if (topup.status !== "PENDING") {
      if (
        topup.status === "COMPLETED" &&
        !topup.mpesaReceipt &&
        typeof receipt === "string"
      ) {
        await MpesaTopUp.updateOne(
          { _id: topup._id },
          { $set: { mpesaReceipt: receipt } }
        ).catch(() => {});
      }

      return ack();
    }

    if (Number(callback.ResultCode) !== 0) {
      await MpesaTopUp.updateOne(
        { _id: topup._id, status: "PENDING" },
        {
          $set: {
            status: "FAILED",
            failReason: String(callback.ResultDesc || "Failed").slice(0, 200),
          },
        }
      );

      return ack();
    }

    if (Number(pick("Amount")) !== topup.amount || typeof receipt !== "string") {
      console.error("🚨 Top-up amount/receipt mismatch", topup._id);

      await MpesaTopUp.updateOne(
        { _id: topup._id, status: "PENDING" },
        { $set: { status: "REVIEW" } }
      );

      return ack();
    }

    const query = await stkQuery(topup.checkoutRequestId);

    if (query.state === "SUCCESS") {
      await creditTopUp(topup.checkoutRequestId, receipt);
    }

    return ack();
  } catch (error) {
    console.error("❌ mpesaCallback:", error.stack || error.message);
    return ack();
  }
}

// ---------- GET /api/wallet/topup/:checkoutRequestId/status ----------
async function getTopUpStatus(req, res) {
  try {
    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const generatedUserId = user.generatedUserId;
    const checkoutRequestId = req.params.checkoutRequestId;

    if (
      typeof checkoutRequestId !== "string" ||
      checkoutRequestId.length > 80
    ) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    let topup = await MpesaTopUp.findOne({
      checkoutRequestId,
      userId: generatedUserId,
    });

    if (!topup) {
      return res.status(404).json({ error: "TOPUP_NOT_FOUND" });
    }

    if (MPESA_ENABLED && topup.status === "PENDING") {
      const query = await stkQuery(checkoutRequestId);

      if (query.state === "SUCCESS") {
        await creditTopUp(checkoutRequestId, null);
      } else if (query.state === "FAILED") {
        await MpesaTopUp.updateOne(
          { _id: topup._id, status: "PENDING" },
          {
            $set: {
              status: "FAILED",
              failReason: query.desc,
            },
          }
        );
      }

      topup = await MpesaTopUp.findById(topup._id);
    }

    return res.json({
      ok: true,
      status: topup.status,
      amount: topup.amount,
    });
  } catch (error) {
    console.error("❌ getTopUpStatus:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// ---------- POST /api/wallet/dev-topup ----------
async function devTopUp(req, res) {
  try {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.ALLOW_DEV_TOPUP !== "true"
    ) {
      return res.sendStatus(404);
    }

    const user = getAuthenticatedUser(req);

    if (!user) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const generatedUserId = user.generatedUserId;
    const amount = req.body?.amount;

    if (!Number.isInteger(amount) || amount < 1 || amount > 20000) {
      return res.status(400).json({ error: "INVALID_AMOUNT" });
    }

    const checkoutRequestId = `DEV-${crypto.randomUUID()}`;

    await MpesaTopUp.create({
      userId: generatedUserId,
      phone: "254700000000",
      amount,
      checkoutRequestId,
    });

    await creditTopUp(
      checkoutRequestId,
      `DEV${crypto.randomBytes(5).toString("hex").toUpperCase()}`
    );

    return res.json({ ok: true, credited: amount });
  } catch (error) {
    console.error("❌ devTopUp:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = {
  getMyWalletDetails,
  handleMpesaTopUp,
  mpesaCallback,
  getTopUpStatus,
  devTopUp,
  darajaFetch,
  getAccessToken,
  normalizePhone,
  safeEq,
  MPESA_ENABLED,
};
