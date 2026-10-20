const express = require("express");
const rateLimit = require("express-rate-limit"); // npm i express-rate-limit
const router = express.Router();

const {
  getMyWalletDetails,
  handleMpesaTopUp,
  getTopUpStatus,
  mpesaCallback,
  devTopUp'
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



if (process.env.NODE_ENV !== "production" && process.env.ALLOW_DEV_TOPUP === "true") {
  router.post("/dev-topup", authenticate, perUser(10), devTopUp);
}

/* ───────────── Safaricom callbacks: PUBLIC ─────────────
   No `authenticate` here. Safaricom calls these, and the secret in the URL is the
   gate. Never mount this router behind a global auth middleware. */
router.post("/pay-callback/:secret", mpesaCallback);
router.post("/b2c-result/:secret", b2cResult);
router.post("/b2c-timeout/:secret", b2cTimeout);

module.exports = router;
