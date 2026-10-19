const express = require("express");
const rateLimit = require("express-rate-limit");
const Product = require("../models/Product");
const UserProfile = require("../models/UserProfile");
const User = require("../models/User");

const router = express.Router();
const perIp = rateLimit({ windowMs: 60 * 1000, limit: 60, message: { error: "TOO_MANY_REQUESTS" } });

const VISIBLE = { status: { $in: ["LISTED", "ACTIVE"] }, isShelved: true, quantity: { $gt: 0 } };
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // a query can never become a pattern

// GET /api/search?q=ankara&type=product|shop   (public)
router.get("/", perIp, async (req, res) => {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
    if (q.length < 2) return res.json([]);
    const type = req.query.type === "shop" ? "shop" : req.query.type === "product" ? "product" : "";
    const rx = new RegExp(escapeRegex(q), "i");
    const out = [];

    if (type !== "shop") {
      const products = await Product.find({ ...VISIBLE, $or: [{ name: rx }, { brandName: rx }, { category: rx }] })
        .select("name brandName category price quantity imageUrl")
        .limit(30)
        .lean();
      out.push(...products.map((p) => ({ ...p, type: "product" })));
    }

    if (type !== "product") {
      // Only public shops of active, paid members, and never emails or phone numbers
      const profiles = await UserProfile.find({ publicProfile: true, username: { $exists: true, $ne: "" }, $or: [{ brandName: rx }, { username: rx }] })
        .select("userId username brandName displayName profilePhoto")
        .limit(15)
        .lean();
      const live = await User.find({
        _id: { $in: profiles.map((p) => p.userId) },
        accountCategory: "network", membershipStatus: "active", isActive: true,
        $or: [{ membershipExpiresAt: null }, { membershipExpiresAt: { $gt: new Date() } }],
      }).select("_id").lean();
      const ok = new Set(live.map((u) => String(u._id)));
      out.push(...profiles.filter((p) => ok.has(String(p.userId))).map(({ userId, ...p }) => ({ ...p, type: "shop" })));
    }
    return res.json(out);
  } catch (e) {
    console.error("❌ search:", e.stack || e.message);
    return res.status(500).json([]);
  }
});

module.exports = router;
