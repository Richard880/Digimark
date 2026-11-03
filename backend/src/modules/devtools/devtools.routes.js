const express = require("express");
const crypto = require("crypto");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const User = require("../../models/User");
const MpesaTopUp = require("../../models/MpesaTopUp");
const AdminAction = require("../../models/AdminAction");
const { PLANS } = require("../config/plans");
const { creditTopUp } = require("../wallet/wallet.controller");

const router = express.Router();
console.warn("⚠️  TEST TOOLS ARE ON (ALLOW_TEST_TOOLS). Turn them off before real users arrive.");

router.use(authenticate.strict, (req, res, next) =>
  ["admin", "super_admin"].includes(req.user?.role) && req.firebaseUser?.email_verified ? next() : res.sendStatus(404), perUser(20));

const log = (req, action, note) => AdminAction.create({ adminId: req.user._id, adminEmail: req.user.email, action: `test_${action}`, targetType: "user", targetId: String(req.user._id), note }).catch(() => {});
const h = (fn) => async (req, res) => { try { await fn(req, res); } catch (e) { console.error("❌ test tools:", e.message); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); } };

router.post("/funds", h(async (req, res) => {
  const a = req.body?.amount;
  if (!Number.isInteger(a) || a < 1 || a > 50000) return res.status(400).json({ error: "INVALID_AMOUNT" });
  const id = `TEST-${crypto.randomUUID()}`;
  await MpesaTopUp.create({ userId: req.user._id, phone: "254700000000", amount: a, checkoutRequestId: id });
  await creditTopUp(id, `TEST${crypto.randomBytes(5).toString("hex").toUpperCase()}`);
  await log(req, "funds", `KES ${a}`);
  res.json({ ok: true });
}));

// Forces the plan on YOUR account only
router.post("/plan", h(async (req, res) => {
  const { plan, days } = req.body || {};
  if (!Object.prototype.hasOwnProperty.call(PLANS, plan) || !Number.isInteger(days) || days < 1 || days > 90) return res.status(400).json({ error: "INVALID_INPUT" });
  const now = new Date();
  await User.updateOne({ _id: req.user._id }, { $set: { accountCategory: "network", membershipStatus: "active", plan, membershipStartedAt: req.user.membershipStartedAt || now, membershipExpiresAt: new Date(now.getTime() + days * 86400000), commissionEligible: true } });
  await log(req, "plan", `${plan} for ${days} days`);
  res.json({ ok: true });
}));

router.post("/expire", h(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $set: { membershipStatus: "expired", membershipExpiresAt: new Date(Date.now() - 1000), commissionEligible: false } });
  await log(req, "expire", "");
  res.json({ ok: true });
}));

module.exports = router;
