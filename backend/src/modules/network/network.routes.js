const express = require("express");
const rateLimit = require("express-rate-limit");
const mongoose = require("mongoose");

const authenticate = require("../../middleware/authenticate");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const matrixService = require("../../../services/matrixService");

const router = express.Router();

// After authenticate, so each member gets their own allowance
const perUser = (limit) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit,
    keyGenerator: (req) => String(req.user._id),
    message: { error: "TOO_MANY_REQUESTS" },
  });

// Only ACTIVE, paid members may see network data (authenticate sets this)
const networkOnly = (req, res, next) =>
  req.userCategory === "network" ? next() : res.status(403).json({ error: "NETWORK_MEMBERSHIP_REQUIRED" });

const serverError = (res, tag, e) => {
  console.error(`❌ ${tag}:`, e.stack || e.message);
  return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
};

/** GET /api/network/matrix-metrics : the member's OWN downline statistics */
router.get("/matrix-metrics", authenticate, networkOnly, perUser(30), async (req, res) => {
  try {
    const result = await matrixService.getMatrixMetrics(req.user._id); // always the caller's id
    if (!result.ok) return res.status(500).json({ error: "METRICS_UNAVAILABLE" });
    return res.json(result);
  } catch (e) {
    return serverError(res, "matrix-metrics", e);
  }
});

/**
 * GET /api/network/team-directory?level=1..4&page=1&limit=20
 * One generation per request, paged. No emails or phone numbers are ever returned.
 */
router.get("/team-directory", authenticate, networkOnly, perUser(30), async (req, res) => {
  try {
    const level = parseInt(req.query.level, 10);
    if (!Number.isInteger(level) || level < 1 || level > matrixService.MAX_DEPTH) {
      return res.status(400).json({ error: "INVALID_LEVEL" });
    }
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const me = req.user._id;

    const rows = await User.aggregate([
      { $match: { pathFromRoot: me, accountCategory: "network" } },
      { $addFields: { level: { $subtract: [{ $size: "$pathFromRoot" }, { $indexOfArray: ["$pathFromRoot", me] }] } } },
      { $match: { level } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit + 1 }, // one extra row tells us if there is a next page
      { $project: { membershipStatus: 1, createdAt: 1 } },
    ]);

    const hasMore = rows.length > limit;
    const members = rows.slice(0, limit);

    const profiles = await UserProfile.find({ userId: { $in: members.map((m) => m._id) } })
      .select("userId username displayName brandName profilePhoto")
      .lean();
    const byUser = new Map(profiles.map((p) => [String(p.userId), p]));

    return res.json({
      ok: true,
      level,
      page,
      hasMore,
      members: members.map((m) => {
        const p = byUser.get(String(m._id)) || {};
        return {
          id: String(m._id),
          username: p.username || "",
          displayName: p.displayName || "",
          brandName: p.brandName || "",
          profilePhoto: p.profilePhoto || "",
          membershipStatus: m.membershipStatus,
          joinedAt: m.createdAt,
        };
      }),
    });
  } catch (e) {
    return serverError(res, "team-directory", e);
  }
});

/** GET /api/network/user/:id/suggest : only YOUR OWN upline chain */
router.get("/user/:id/suggest", authenticate, networkOnly, perUser(30), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "INVALID_TARGET_USER_ID" });
    if (String(req.params.id) !== String(req.user._id)) return res.status(403).json({ error: "ACCESS_DENIED" });

    const suggestions = await matrixService.calculateUplineSuggestions(req.user._id, 12);
    return res.json({ sponsor: String(req.user._id), suggestions });
  } catch (e) {
    return serverError(res, "suggest", e);
  }
});

module.exports = router;
