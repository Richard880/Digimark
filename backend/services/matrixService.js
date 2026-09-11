// services/matrixService.js
const mongoose = require("mongoose");
const User = require("../models/User");

const MAX_DIRECT = 10;
const MAX_DEPTH = 4;

/**
 * High-performance Asynchronous BFS Traversal forced-matrix auto-placement engine
 * Locates the absolute next available structural parent row node balancing the network
 * @param {mongoose.Types.ObjectId} sponsorObjectId 
 * @returns {Promise<{ok: boolean, parentId?: mongoose.Types.ObjectId, level?: number, reason?: string}>}
 */
async function findMlmPlacement(sponsorObjectId) {
  const rootUser = await User.findById(sponsorObjectId);
  if (!rootUser) return { ok: false, reason: "SPONSOR_NOT_FOUND" };

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
    if (!currentMember) continue;

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
  if (!validSponsor) return [];

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

module.exports = {
  findMlmPlacement,
  calculateUplineSuggestions
};
