// services/matrixService.js
const mongoose = require("mongoose");
const User = require("../src/models/User"); // must be the SAME User file auth.service.js loads

const MAX_DIRECT = 10; // direct slots per member
const MAX_DEPTH = 4;   // levels counted from the sponsor

const sizeOf = (refs) => (Array.isArray(refs) ? refs.length : 0);

const emptyGenerations = () => {
  const g = {};
  for (let i = 1; i <= MAX_DEPTH; i++) g[`level_${i}`] = 0;
  return g;
};

const emptyMetrics = () => ({
  ok: true,
  summary: { totalDownline: 0, activeDownline: 0, inactiveDownline: 0, activityDensityPercentage: 0 },
  spilloverMetrics: { totalSpillovers: 0, spilloverRatePercentage: 0 },
  generations: emptyGenerations(),
  legBalanceMatrix: {},
});

/**
 * Breadth-first forced-matrix placement, one DATABASE query per level (max 4).
 * Advisory only: the real slot is claimed atomically in auth.service placeInMatrix().
 * @returns {Promise<{ok: boolean, parentId?: ObjectId, level?: number, reason?: string}>}
 */
async function findMlmPlacement(sponsorObjectId) {
  if (!mongoose.isValidObjectId(sponsorObjectId)) return { ok: false, reason: "SPONSOR_NOT_FOUND" };

  const sponsor = await User.findById(sponsorObjectId)
    .select("accountCategory membershipStatus referrals")
    .lean();
  if (!sponsor) return { ok: false, reason: "SPONSOR_NOT_FOUND" };
  if (sponsor.accountCategory !== "network") return { ok: false, reason: "TARGET_SPONSOR_NOT_A_NETWORK_MEMBER" };
  if (sponsor.membershipStatus !== "active") return { ok: false, reason: "SPONSOR_NOT_ACTIVE" };

  let frontier = [sponsor]; // members at the current level, in left-to-right order

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const open = frontier.find((n) => sizeOf(n.referrals) < MAX_DIRECT);
    if (open) return { ok: true, parentId: open._id, level: depth };
    if (depth === MAX_DEPTH) break;

    const childIds = frontier.flatMap((n) => n.referrals || []);
    if (!childIds.length) break;

    const rows = await User.find({ _id: { $in: childIds }, accountCategory: "network" })
      .select("referrals")
      .lean();
    const byId = new Map(rows.map((r) => [String(r._id), r]));
    frontier = childIds.map((id) => byId.get(String(id))).filter(Boolean); // keeps the order
  }

  return { ok: false, reason: "COMMUNITY_FULL" };
}

/**
 * Walks up the sponsor chain and lists ancestors that still have free slots.
 * If exposed through a route, only show it to the signed-in member about their OWN chain.
 */
async function calculateUplineSuggestions(userObjectId, maxSuggestions = 12) {
  if (!mongoose.isValidObjectId(userObjectId)) return [];
  const limit = Math.min(Math.max(1, maxSuggestions | 0), 20);

  let node = await User.findById(userObjectId).select("accountCategory referrals sponsorId").lean();
  if (!node || node.accountCategory !== "network") return [];

  const suggestions = [];
  const seen = new Set(); // protects against a corrupted loop in the chain
  while (node && suggestions.length < limit && !seen.has(String(node._id))) {
    seen.add(String(node._id));
    const used = sizeOf(node.referrals);
    if (used < MAX_DIRECT) {
      suggestions.push({ userId: node._id, level: "upline", free: MAX_DIRECT - used });
    }
    if (!node.sponsorId) break;
    node = await User.findById(node.sponsorId).select("accountCategory referrals sponsorId").lean();
  }
  return suggestions;
}

/**
 * Downline statistics for ONE member, up to MAX_DEPTH levels.
 * Uses each member's stored ancestor path (pathFromRoot), so it never builds a giant document.
 * rootUserId MUST be req.user._id, never a value from the URL or query string.
 */
async function getMatrixMetrics(rootUserId) {
  try {
    if (!rootUserId) return { ok: false, error: "USER_ID_MANDATORY" };
    if (!mongoose.isValidObjectId(rootUserId)) return { ok: false, error: "INVALID_USER_ID" };

    const anchorId = new mongoose.Types.ObjectId(String(rootUserId));
    const anchor = await User.findOne({ _id: anchorId, accountCategory: "network" })
      .select("referrals")
      .lean();
    if (!anchor) return emptyMetrics();

    const idx = { $indexOfArray: ["$pathFromRoot", anchorId] };
    const members = await User.aggregate([
      { $match: { pathFromRoot: anchorId, accountCategory: "network" } },
      { $addFields: { level: { $subtract: [{ $size: "$pathFromRoot" }, idx] } } },
      { $match: { level: { $gte: 1, $lte: MAX_DEPTH } } },
      {
        $project: {
          level: 1, membershipStatus: 1, sponsorId: 1, parentId: 1,
          // which of my direct legs this member sits under (a direct child is its own leg)
          leg: { $ifNull: [{ $arrayElemAt: ["$pathFromRoot", { $add: [idx, 1] }] }, "$_id"] },
        },
      },
    ]);

    const generations = emptyGenerations();
    const legBalanceMatrix = {};
    (anchor.referrals || []).forEach((id, i) => {
      legBalanceMatrix[String(id)] = { legLabel: `Leg Position ${i + 1}`, totalCount: 0, activeCount: 0 };
    });

    let activeDownline = 0;
    let totalSpillovers = 0;

    for (const m of members) {
      const active = m.membershipStatus === "active";
      if (active) activeDownline++;
      generations[`level_${m.level}`]++;

      if (m.sponsorId && m.parentId && String(m.sponsorId) !== String(m.parentId)) totalSpillovers++;

      const leg = legBalanceMatrix[String(m.leg)];
      if (leg) {
        leg.totalCount++;
        if (active) leg.activeCount++;
      }
    }

    const total = members.length;
    const pct = (n) => (total > 0 ? parseFloat(((n / total) * 100).toFixed(2)) : 0);
    return {
      ok: true,
      summary: {
        totalDownline: total,
        activeDownline,
        inactiveDownline: total - activeDownline,
        activityDensityPercentage: pct(activeDownline),
      },
      spilloverMetrics: { totalSpillovers, spilloverRatePercentage: pct(totalSpillovers) },
      generations,
      legBalanceMatrix,
    };
  } catch (error) {
    console.error("❌ Matrix Engine Analytics Fault:", error.stack || error.message);
    return { ok: false, error: "METRICS_COMPUTATION_CRASHED" };
  }
}

module.exports = { findMlmPlacement, calculateUplineSuggestions, getMatrixMetrics, MAX_DIRECT, MAX_DEPTH };
