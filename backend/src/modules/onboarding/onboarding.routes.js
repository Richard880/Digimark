const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const Wallet = require("../../models/Wallet");
const Order = require("../../models/Order");
const Product = require("../../models/Product");
const ChatKey = require("../../models/ChatKey");

const router = express.Router();
const ADMIN_ROLES = ["admin", "super_admin"];

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });

// Only step keys and done/not-done flags leave the server. The wording lives in the frontend.
router.get("/", authenticate, perUser(30), async (req, res) => {
  try {
    const u = req.user;
    if (ADMIN_ROLES.includes(u.role)) return res.json({ ok: true, dismissed: true, steps: [], done: 0, total: 0 });

    const me = u._id;
    const isNetwork = u.accountCategory === "network";
    const paid = req.userCategory === "network"; // active, unexpired membership

    const [profile, deposited, ordered, product, invited, chat] = await Promise.all([
      UserProfile.findOne({ userId: me }).select("phoneNumber profilePhoto brandName brandCategory address location.county").lean(),
      Wallet.exists({ userId: me, "transactions.type": "deposit" }),
      Order.exists({ buyerId: me }),
      isNetwork ? Product.exists({ sellerId: me }) : null,
      isNetwork ? User.exists({ $or: [{ sponsorId: me }, { referredBy: me }] }) : null,
      ChatKey.exists({ userId: me }),
    ]);

    // The token's flag can lag by up to an hour, so the saved flag counts too
    const email = !!(req.firebaseUser?.email_verified || u.emailVerified);
    const brand = !!(profile?.brandName && profile?.brandCategory && profile?.address && profile?.location?.county && profile?.phoneNumber);

    const list = isNetwork
      ? [["email", email], ["brand", brand], ["membership", paid], ["firstProduct", !!product], ["invite", !!invited], ["chat", !!chat]]
      : [["email", email], ["photo", !!profile?.profilePhoto], ["topup", !!deposited], ["firstOrder", !!ordered]];

    const steps = list.map(([key, done]) => ({ key, done }));
    res.json({
      ok: true,
      role: isNetwork ? "marketer" : "buyer",
      steps,
      done: steps.filter((s) => s.done).length,
      total: steps.length,
      dismissed: !!u.onboardingDismissedAt,
    });
  } catch (e) {
    console.error("❌ onboarding:", e.stack || e.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

router.post("/dismiss", authenticate, perUser(10), async (req, res) => {
  try {
    await User.updateOne({ _id: req.user._id }, { $set: { onboardingDismissedAt: new Date() } });
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ onboarding dismiss:", e.stack || e.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

module.exports = router;
