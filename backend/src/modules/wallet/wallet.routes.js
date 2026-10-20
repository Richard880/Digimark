const express = require("express");
const rateLimit = require("express-rate-limit"); // npm i express-rate-limit
const router = express.Router();

const {
  getMyWalletDetails,
  handleMpesaTopUp, 
  mpesaCallback, 
  getTopUpStatus, 
  devTopUp,
  darajaFetch, 
  getAccessToken, 
  normalizePhone, 
  safeEq, // shared with withdraw.controller
  MPESA_ENABLED,
} = require("./wallet.controller");

const {
  requestWithdrawal,
  listWithdrawals,
  b2cResult,
  b2cTimeout,
} = require("./withdraw.controller");

// 🔒 Your existing authentication middleware
const authenticate = require("../../middleware/authenticate");

// Rate limits are keyed by user id, so they must run AFTER authenticate
const perUser = (limit, windowMs = 60 * 1000) =>
  rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => String(req.user._id),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "TOO_MANY_REQUESTS" },
  });

/* ───────────── Public Config & Feature Flags ───────────── */

// Exposes the feature flag status so your frontend layout knows whether to render M-Pesa menus
router.get("/config", (req, res) => {
  return res.status(200).json({ mpesaEnabled: MPESA_ENABLED });
});

/* ───────────── Authenticated user routes ───────────── */

// Balance + last 30 transactions
router.get("/my-balance", authenticate, perUser(60), getMyWalletDetails);

// Start an M-Pesa STK push (credits nothing until Safaricom confirms)
router.post("/mpesa-topup", authenticate, perUser(5), handleMpesaTopUp);

// Poll this every ~5s after the STK push; it settles the top-up if the callback was missed
router.get("/topup/:checkoutRequestId/status", authenticate, perUser(30), getTopUpStatus);

// Withdraw to the phone saved on the account (requires an Idempotency-Key header)
router.post("/withdraw", authenticate, perUser(3), requestWithdrawal);
router.get("/withdrawals", authenticate, perUser(30), listWithdrawals);

/* ───────────── Development & Debugging Utilities ───────────── */

// Utility phone normalizer tool for frontend form checks
router.post("/utils/normalize-phone", authenticate, perUser(30), (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "PHONE_REQUIRED" });
  return res.status(200).json({ normalized: normalizePhone(phone) });
});

// Secure equality verification tool for transaction references
router.post("/utils/verify-reference", authenticate, perUser(30), (req, res) => {
  const { input, target } = req.body;
  return res.status(200).json({ match: safeEq(input, target) });
});

// Non-production testing backdoors for simulation endpoints
if (process.env.NODE_ENV !== "production" || process.env.ALLOW_DEV_TOPUP === "true") {
  // Manual local wallet credit bypass
  router.post("/dev-topup", authenticate, perUser(10), devTopUp);

  // Daraja connectivity verification check (Tests Daraja access token validity)
  router.get("/dev/daraja-token", authenticate, async (req, res) => {
    try {
      const token = await getAccessToken();
      return res.status(200).json({ ok: true, token });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });

  // Daraja raw fetch endpoint connectivity pipeline test
  router.post("/dev/daraja-fetch", authenticate, async (req, res) => {
    const { url, options } = req.body;
    try {
      const data = await darajaFetch(url, options);
      return res.status(200).json({ ok: true, data });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }
  });
}

/* ───────────── Safaricom callbacks: PUBLIC ─────────────
   No `authenticate` here. Safaricom calls these, and the secret in the URL is the
   gate. Never mount this router behind a global auth middleware. */
router.post("/pay-callback/:secret", mpesaCallback);
router.post("/b2c-result/:secret", b2cResult);
router.post("/b2c-timeout/:secret", b2cTimeout);

module.exports = router;
