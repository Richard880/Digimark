// utils/mlmPlacement.js (Upgraded to Non-Blocking Production Architecture)
const mlmDb = require("../data/mlm");

// Constants matching your enterprise model specification
const MAX_DIRECT = 10;
const MAX_DEPTH = 4; // Max structural matrix depth levels

/**
 * Asynchronously locates the next available auto-placement tree slot using a BFS strategy
 * @param {string} sponsorId - The reference ID of the network sponsor
 * @returns {Promise<Object>} - `{ ok: true, parentId, level }` or `{ ok: false, reason }`
 */
async function findPlacement(sponsorId) {
  // 🟢 Await the asynchronous database read pipeline
  const root = await mlmDb.getById(sponsorId);
  if (!root) return { ok: false, reason: "SPONSOR_NOT_FOUND" };

  // Check if sponsor has immediate space at Level 1
  if ((root.referrals || []).length < MAX_DIRECT) {
    return { ok: true, parentId: sponsorId, level: 1 };
  }

  // BFS Queue tracking: { id, depth } with depth starting at 2 for grandchildren
  const q = [];
  (root.referrals || []).forEach((rid) => q.push({ id: rid, depth: 2 }));

  while (q.length) {
    const { id, depth } = q.shift();
    
    // 🟢 Await database fetch inside the queue tracking thread loop
    const u = await mlmDb.getById(id);
    if (!u) continue;

    // Reject processing if depth breaks forced-matrix boundary rules
    if (depth > MAX_DEPTH) continue;

    // If an open position is discovered, lock the slot coordinates immediately
    if ((u.referrals || []).length < MAX_DIRECT) {
      return { ok: true, parentId: id, level: depth };
    }

    // Push next generation row references down into the traversal timeline
    (u.referrals || []).forEach((cid) => {
      q.push({ id: cid, depth: depth + 1 });
    });
  }

  // Matrix exhaust reached without discovering open slots
  return { ok: false, reason: "TREE_FULL" };
}

/**
 * Suggests alternative placement candidates within the network tree
 * @param {string} sponsorId - The reference ID of the network sponsor
 * @param {number} max - The maximum number of suggestions to return
 * @returns {Promise<Array>} - Array of available slot suggestion configurations
 */
async function suggestSlots(sponsorId, max = 10) {
  const suggestions = [];
  const root = await mlmDb.getById(sponsorId);
  if (!root) return suggestions;

  // Track upward tree hierarchy trajectory (Upline search phase)
  let cur = root;
  while (cur) {
    if ((cur.referrals || []).length < MAX_DIRECT) {
      suggestions.push({
        userId: cur.id,
        level: "upline",
        free: MAX_DIRECT - (cur.referrals || []).length,
      });
      if (suggestions.length >= max) return suggestions;
    }
    if (!cur.sponsorId) break;
    
    // 🟢 Await structural upline reference generation mapping
    cur = await mlmDb.getById(cur.sponsorId);
  }

  // Global network pool balancing search phase
  const all = await mlmDb.getAll();
  for (const u of all) {
    if ((u.referrals || []).length < MAX_DIRECT) {
      if (!suggestions.find((s) => s.userId === u.id)) {
        suggestions.push({
          userId: u.id,
          free: MAX_DIRECT - (u.referrals || []).length,
        });
      }
    }
    if (suggestions.length >= max) break;
  }

  return suggestions;
}

module.exports = {
  findPlacement,
  suggestSlots,
  MAX_DIRECT,
  MAX_DEPTH,
};
