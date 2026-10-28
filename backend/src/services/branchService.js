const Branch = require("../models/Branch");
const User = require("../models/User");
const { entitlementsFor } = require("../modules/membership/entitlements"); // adjust path if needed

/**
 * Returns the primary branch for a seller.
 * Creates it automatically if it does not exist (respecting plan limits).
 */
async function getOrCreatePrimaryBranch(sellerId, session = null) {
  const opts = session ? { session } : {};

  let branch = await Branch.findOne({ sellerId, isPrimary: true }, null, opts);
  if (branch) return branch;

  // Load user to check plan limits
  const user = await User.findById(sellerId)
    .select("plan membershipStatus membershipExpiresAt accountCategory")
    .session(session || null)
    .lean();

  const ent = entitlementsFor(user);
  const count = await Branch.countDocuments({ sellerId }, opts);

  if (count >= ent.limits.branches) {
    const err = new Error("BRANCH_LIMIT_REACHED");
    err.code = "BRANCH_LIMIT_REACHED";
    throw err;
  }

  const [created] = await Branch.create(
    [
      {
        sellerId,
        name: "Main Branch",
        isPrimary: true,
      },
    ],
    opts
  );

  return created;
}

module.exports = { getOrCreatePrimaryBranch };
