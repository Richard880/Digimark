// services/matrixService.js
const mongoose = require("mongoose");
const User = require("../models/User");

const MAX_DIRECT = 10;
const MAX_DEPTH = 4;

/**
 * High-performance Asynchronous BFS Traversal forced-matrix auto-placement engine
 * Locates the absolute next available structural parent row node balancing the network.
 * Explicitly ignores "retail" category accounts.
 * @param {mongoose.Types.ObjectId} sponsorObjectId 
 * @returns {Promise<{ok: boolean, parentId?: mongoose.Types.ObjectId, level?: number, reason?: string}>}
 */
async function findMlmPlacement(sponsorObjectId) {
  const rootUser = await User.findById(sponsorObjectId);
  if (!rootUser) return { ok: false, reason: "SPONSOR_NOT_FOUND" };
  if (rootUser.accountCategory !== "network") {
    return { ok: false, reason: "TARGET_SPONSOR_NOT_A_NETWORK_MEMBER" };
  }

  // Level 1 Immediate Check
  if (rootUser.referrals.length < MAX_DIRECT) {
    return { ok: true, parentId: rootUser._id, level: 1 };
  }

  // Traversal array tracking hierarchy queue nodes
  const queue = [];
  rootUser.referrals.forEach((rid) => queue.push({ id: rid, depth: 2 }));

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    const currentMember = await User.findById(id);
    if (!currentMember || currentMember.accountCategory !== "network") continue;

    if (depth > MAX_DEPTH) continue;

    if (currentMember.referrals.length < MAX_DIRECT) {
      return { ok: true, parentId: currentMember._id, level: depth };
    }

    currentMember.referrals.forEach((cid) => {
      queue.push({ id: cid, depth: depth + 1 });
    });
  }

  return { ok: false, reason: "COMMUNITY_FULL" };
}

/**
 * Resolves ancestral upline node positions for placement calculations
 * @param {mongoose.Types.ObjectId} userObjectId 
 * @param {number} maxSuggestions 
 * @returns {Promise<Array>}
 */
async function calculateUplineSuggestions(userObjectId, maxSuggestions = 12) {
  const validSponsor = await User.findById(userObjectId);
  if (!validSponsor || validSponsor.accountCategory !== "network") return [];

  const suggestions = [];
  let currentAncestor = validSponsor;

  while (currentAncestor && suggestions.length < maxSuggestions) {
    if (currentAncestor.referrals.length < MAX_DIRECT) {
      suggestions.push({
        userId: currentAncestor._id,
        level: "upline",
        free: MAX_DIRECT - currentAncestor.referrals.length
      });
    }
    if (!currentAncestor.sponsorId) break;
    currentAncestor = await User.findById(currentAncestor.sponsorId);
  }

  return suggestions;
}

/**
 * 🎯 High-Performance Matrix Metrics Engine
 * Aggregates downline metrics up to MAX_DEPTH inside a single database pass
 * @param {mongoose.Types.ObjectId|string} rootUserId - Target node to build performance metrics for
 */
async function getMatrixMetrics(rootUserId) {
  try {
    if (!mongoose.isValidObjectId(rootUserId)) {
      return { ok: false, error: "INVALID_USER_ID" };
    }

    const anchorId = new mongoose.Types.ObjectId(rootUserId);

    // 1. Single database pass using graph traversal matching only network node boundaries
    const downlineTree = await User.aggregate([
      { \$match: { _id: anchorId, accountCategory: "network" } },
      {
        \$graphLookup: {
          from: "users",
          startWith: "\$referrals",
          connectFromField: "referrals",
          connectToField: "_id",
          as: "matrixDownline",
          maxDepth: MAX_DEPTH - 1, // 0-indexed boundary mapping
          depthField: "generationDepth",
          restrictExpression: { \(eq: ["\)\$referred.accountCategory", "network"] } // Excludes retail anomalies from trace leaks
        }
      }
    ]);

    if (!downlineTree || downlineTree.length === 0) {
      return { ok: false, error: "NETWORK_NODE_NOT_FOUND" };
    }

    const members = downlineTree[0].matrixDownline || [];
    const directChildren = (downlineTree[0].referrals || []).map(id => id.toString());

    // 2. Initializing Accumulators
    let totalDownline = members.length;
    let activeDownline = 0;
    let totalSpillovers = 0;

    const generations = {};
    for (let i = 1; i <= MAX_DEPTH; i++) {
      generations[`level_${i}`] = 0;
    }

    const legBalanceMatrix = {};
    directChildren.forEach((childId, index) => {
      legBalanceMatrix[childId] = {
        legLabel: `Leg Position ${index + 1}`,
        totalCount: 0,
        activeCount: 0
      };
    });

    // 3. Metric Aggregation Loop
    members.forEach((member) => {
      if (member.isActive) activeDownline++;

      const exactLevel = member.generationDepth + 1;
      if (generations[`level_${exactLevel}`] !== undefined) {
        generations[`level_${exactLevel}`]++;
      }

      // Spillover Evaluation: placement parentId is different from direct referral sponsorId
      if (member.sponsorId && member.parentId && member.sponsorId.toString() !== member.parentId.toString()) {
        totalSpillovers++;
      }

      // Leg Balance Sorting
      if (member.pathFromRoot && member.pathFromRoot.length > 0) {
        // Trace back which direct child of the anchor node this member stems from
        const anchorIndex = member.pathFromRoot.findIndex(id => id.toString() === anchorId.toString());
        if (anchorIndex !== -1 && member.pathFromRoot[anchorIndex + 1]) {
          const matchingLegId = member.pathFromRoot[anchorIndex + 1].toString();
          if (legBalanceMatrix[matchingLegId]) {
            legBalanceMatrix[matchingLegId].totalCount++;
            if (member.isActive) legBalanceMatrix[matchingLegId].activeCount++;
          }
        }
      }
    });

    return {
      ok: true,
      summary: {
        totalDownline,
        activeDownline,
        inactiveDownline: totalDownline - activeDownline,
        activityDensityPercentage: totalDownline > 0 ? parseFloat(((activeDownline / totalDownline) * 100).toFixed(2)) : 0
      },
      spilloverMetrics: {
        totalSpillovers,
        spilloverRatePercentage: totalDownline > 0 ? parseFloat(((totalSpillovers / totalDownline) * 100).toFixed(2)) : 0
      },
      generations,
      legBalanceMatrix
    };
  } catch (error) {
    console.error("❌ Matrix Engine Analytics Fault:", error.message);
    return { ok: false, error: "METRICS_COMPUTATION_CRASHED", reason: error.message };
  }
}

module.exports = {
  findMlmPlacement,
  calculateUplineSuggestions,
  getMatrixMetrics
};
