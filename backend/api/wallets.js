// api/wallets.js
const express = require("express");
const router = express.Router();
const wallets = require("../data/wallets");
const mlm = require("../utils/mlm");
// Change line 6 in wallets.js to:
const users = require("../data/mlm_users.json");
// optional if you keep users/referrals

// simple middleware for simulated auth in dev: require X-User-Id header
function requireUser(req, res, next) {
  const uid = req.headers["x-user-id"] || req.body.userId || null;
  if (!uid) return res.status(401).json({ error: "NO_USER" });
  req.user = { id: uid };
  next();
}

// init wallet (dev helper)
router.post("/init", (req, res) => {
  const { userId, balance = 0 } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const w = wallets.createWallet(userId, Number(balance));
  return res.json({ wallet: w });
});

// deposit (simulate MPesa or admin top up)
router.post("/deposit", requireUser, (req, res) => {
  const { amount, method = "mpesa" } = req.body;
  if (!amount) return res.status(400).json({ error: "amount required" });
  try {
    const { wallet, tx } = wallets.deposit(req.user.id, Number(amount), {
      method,
    });
    return res.json({ wallet, tx });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// withdraw
router.post("/withdraw", requireUser, (req, res) => {
  const { amount, destination = "mpesa" } = req.body;
  const r = wallets.withdraw(req.user.id, Number(amount), { destination });
  if (!r.ok) return res.status(402).json({ error: r.error });
  return res.json(r);
});

// transfer
router.post("/transfer", requireUser, (req, res) => {
  const { toUserId, amount } = req.body;
  if (!toUserId || !amount)
    return res.status(400).json({ error: "toUserId and amount required" });
  const r = wallets.transfer(req.user.id, toUserId, Number(amount), {
    note: req.body.note,
  });
  if (!r.ok) return res.status(402).json({ error: r.error });
  return res.json(r);
});

// admin credit (only in dev; in prod guard this)
router.post("/admin/credit", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount)
    return res.status(400).json({ error: "userId and amount required" });
  const r = wallets.adminCredit(userId, Number(amount), { by: "admin" });
  return res.json(r);
});

router.post("/purchase/float", requireUser, (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ error: "UNAUTHENTICATED" });
  }

  const userId = req.user.id;
  const plan = req.body.plan; // ✅ FIXED

  const PLANS = {
    "24h": 50,
    "7d": 250,
    "30d": 1000,
  };

  const price = PLANS[plan];
  if (!price) {
    return res.status(400).json({ error: "INVALID_PLAN" });
  }

  const wallet = wallets.getWallet(userId);
  if (!wallet) {
    return res.status(404).json({ error: "WALLET_NOT_FOUND" });
  }

  // ✅ CHECK FIRST
  if (wallets.hasActiveFloat(wallet)) {
    return res.status(409).json({ error: "FLOAT_ALREADY_ACTIVE" });
  }

  if (wallet.balance < price) {
    return res.status(402).json({ error: "INSUFFICIENT_FUNDS" });
  }

  // 1️⃣ Deduct money
  const ok = wallets.withdraw(userId, price, {
    reason: "FLOAT_SUBSCRIPTION",
    plan,
  });

  if (!ok) {
    return res.status(500).json({ error: "WITHDRAW_FAILED" });
  }

  // 2️⃣ Activate float
  const result = wallets.activateFloat(userId, plan);
  if (!result.ok) {
    return res.status(500).json(result);
  }

  return res.json({
    success: true,
    plan,
    price,
    wallet: result.wallet,
  });
});

// buy subscription
router.post("/purchase/subscription", requireUser, (req, res) => {
  const { months = 1, price = 10 } = req.body;
  const r = wallets.purchaseSubscription(
    req.user.id,
    Number(months),
    Number(price),
  );
  if (!r.ok) return res.status(402).json({ error: r.error });
  // optionally distribute commissions
  if (typeof usersDb !== "undefined" && usersDb.getById) {
    const referralMap = (id) => {
      const u = usersDb.getById(id);
      return u ? u.referrerId : null;
    };
    mlm.distributeCommissions(req.user.id, r.tx.amount, referralMap);
  }
  return res.json(r);
});

// get balance
router.get("/balance", requireUser, (req, res) => {
  const w = wallets.getWallet(req.user.id);
  return res.json({
    wallet: w || { userId: req.user.id, balance: 0, transactions: [] },
  });
});

// transactions
router.get("/transactions", requireUser, (req, res) => {
  const { limit = 50, offset = 0 } = req.query;
  const list = wallets.getTransactions(
    req.user.id,
    Number(limit),
    Number(offset),
  );
  res.json({ transactions: list });
});

/* ---------- MPESA simulate webhook (dev) ----------
   POST /wallets/mpesa/simulate
   { userId, amount }
   This simulates an external payment hitting your system and deposits to wallet.
*/
router.post("/mpesa/simulate", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount)
    return res.status(400).json({ error: "userId and amount required" });
  // in real system you'd validate callback - here we immediately credit
  const { wallet, tx } = wallets.deposit(userId, Number(amount), {
    method: "mpesa_sim",
  });
  return res.json({ wallet, tx });
});

module.exports = router;
