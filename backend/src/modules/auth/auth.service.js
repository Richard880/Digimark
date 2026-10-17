const mongoose = require("mongoose");
const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile.js");
const Wallet = require("../../models/Wallet");
const matrixService = require("../../../services/matrixService");
// const generateMembershipNumber = require("../../utils/membershipNumber");

const MAX_DIRECT_REFERRALS = 10;
const ROOT_EMAIL = (process.env.COMPANY_ROOT_EMAIL || "admin@sokodigi.com").toLowerCase();
const NETWORK_REQUIRED = ["firstName", "lastName", "phoneNumber", "username", "brandName"];

// Deliberate errors: the controller turns { code, status } into a clean response
class AppError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function normalizePhone(raw) {
  const p = String(raw || "").replace(/[\s+-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) return "254" + p.slice(1);
  if (/^254[17]\d{8}$/.test(p)) return p;
  return null;
}

// Atomically take one of the parent's 10 child slots. Returns null if it is full.
async function claimSlot(parentId, childId, session) {
  return User.findOneAndUpdate(
    {
      _id: parentId,
      accountCategory: "network",
      $expr: { $lt: [{ $size: { $ifNull: ["$referrals", []] } }, MAX_DIRECT_REFERRALS] },
    },
    { $push: { referrals: childId } },
    { new: true, session, projection: { pathFromRoot: 1 } }
  );
}

/**
 * Places a PAID network member in the matrix.
 * Call this from the membership-payment transaction (fee split to uplines happens there too).
 * `session` is required so a failure rolls back the slot claim.
 */
async function placeInMatrix(userId, session) {
  if (!session) throw new Error("SESSION_REQUIRED");
  const user = await User.findById(userId).session(session);
  if (!user || user.accountCategory !== "network") throw new AppError("NOT_A_NETWORK_ACCOUNT", 400);
  if (user.parentId || !user.sponsorId) return user; // already placed, or the company root

  for (let attempt = 0; attempt < 5; attempt++) {
    const placement = await matrixService.findMlmPlacement(user.sponsorId);
    if (!placement || !placement.ok) throw new AppError("COMMUNITY_FULL", 409);

    const parent = await claimSlot(placement.parentId, user._id, session);
    if (!parent) continue; // someone took that slot a moment ago: find the next one

    const placed = await User.findOneAndUpdate(
      { _id: user._id, parentId: null },
      { $set: { parentId: parent._id, pathFromRoot: [...(parent.pathFromRoot || []), parent._id] } },
      { new: true, session }
    );
    if (!placed) throw new AppError("ALREADY_PLACED", 409); // aborts the slot claim too
    return placed;
  }
  throw new AppError("PLACEMENT_BUSY", 503);
}

async function createAccount({ firebaseUid, cleanEmail, emailVerified, userData }) {
  // The client only REQUESTS a category; everything else is decided here
  const isNetwork = userData.accountCategory === "network";

  if (isNetwork) {
    for (const f of NETWORK_REQUIRED) {
      if (!userData[f]) throw new AppError(`REQUIRED_${f.toUpperCase()}`, 400);
    }
  }
  if (userData.username && (await UserProfile.exists({ username: userData.username }))) {
    throw new AppError("USERNAME_TAKEN", 409);
  }

  let sponsorId = null;
  let isRoot = false;

  if (isNetwork) {
    const root = await User.findOne({ email: ROOT_EMAIL, accountCategory: "network" }).select("_id").lean();
    if (!root) {
      // Only the VERIFIED owner of the root email may bootstrap the network
      if (cleanEmail === ROOT_EMAIL && emailVerified) isRoot = true;
      else throw new AppError("NETWORK_NOT_OPEN", 503);
    } else {
      sponsorId = root._id;
      if (userData.sponsorUserId) {
        const s = await User.findOne({
          _id: userData.sponsorUserId,
          accountCategory: "network",
          membershipStatus: "active",
        }).select("_id").lean();
        if (!s) throw new AppError("INVALID_SPONSOR", 400); // no silent fallback to the company
        sponsorId = s._id;
      }
    }
  }

  try {
    // User + wallet together: no user ever exists without a wallet
    return await mongoose.connection.transaction(async (session) => {
      const [u] = await User.create(
        [{
          firebaseUid,
          email: cleanEmail,
          emailVerified,
          accountCategory: isNetwork ? "network" : "retail",
          accountType: isNetwork ? "member" : "user",
          role: isNetwork ? "member" : "user",
          membershipStatus: isNetwork ? (isRoot ? "active" : "pending") : "active",
          sponsorId,          // remembered now, but NO matrix slot is taken until payment
          parentId: null,
          pathFromRoot: [],
          referrals: [],
        }],
        { session }
      );
      await Wallet.updateOne(
        { userId: u._id },
        { $setOnInsert: { balance: 0, escrowBalance: 0, transactions: [], isFrozen: false } },
        { upsert: true, session }
      );
      return u;
    });
  } catch (e) {
    // Two syncs at the same moment: the other one won, so use its user
    if (e.code === 11000 && e.keyPattern && e.keyPattern.firebaseUid) {
      const existing = await User.findOne({ firebaseUid });
      if (existing) return existing;
    }
    throw e;
  }
}

async function synchronizeFirebaseUser({
  firebaseUid,
  email,
  emailVerified,
  displayName,
  defaultPhoto = null,
  userData = {},
}) {
  const cleanEmail = typeof email === "string" ? email.toLowerCase() : undefined;
  let user = await User.findOne({ firebaseUid });

  if (!user) {
    user = await createAccount({ firebaseUid, cleanEmail, emailVerified, userData });
  } else {
    // Returning user: never touches role, category, sponsor or placement
    const $set = { emailVerified, lastLoginAt: new Date() };
    if (cleanEmail) $set.email = cleanEmail;
    user = await User.findOneAndUpdate({ firebaseUid }, { $set }, { new: true });
  }

  const firstName = userData.firstName || displayName?.split(" ")[0] || "";
  const lastName = userData.lastName || displayName?.split(" ").slice(1).join(" ") || "";
  const fullName = `${firstName} ${lastName}`.trim();

  let profile = await UserProfile.findOne({ userId: user._id });

  if (!profile) {
   const membershipNumber = undefined; // issued at activation
    try {
      profile = await UserProfile.create({
        userId: user._id,
        membershipNumber,
        username: userData.username,
        firstName,
        lastName,
        displayName: displayName || fullName,
        brandName: userData.brandName || fullName,
        phoneNumber: userData.phoneNumber || "",
        profilePhoto: userData.profilePhoto || defaultPhoto || "",
      });
    } catch (e) {
      // The other parallel sync created it first (needs a unique index on userId)
      if (e.code === 11000 && e.keyPattern && e.keyPattern.userId) {
        profile = await UserProfile.findOne({ userId: user._id });
      } else {
        throw e;
      }
    }
  } else {
    const updates = {};
    for (const f of ["firstName", "lastName", "username", "brandName"]) {
      if (userData[f]) updates[f] = userData[f];
    }
    // Withdrawals pay out to this number, so it locks once set
    if (userData.phoneNumber) {
      if (!profile.phoneNumber) {
        updates.phoneNumber = userData.phoneNumber;
      } else if (normalizePhone(profile.phoneNumber) !== normalizePhone(userData.phoneNumber)) {
        throw new AppError("PHONE_CHANGE_NOT_ALLOWED", 409);
      }
    }
    if (userData.profilePhoto) updates.profilePhoto = userData.profilePhoto; // explicit uploads only

    if (Object.keys(updates).length) {
      profile = await UserProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: updates },
        { new: true, runValidators: true }
      );
    }
  }

  // Never send the Firebase uid or the internal matrix path to the browser
  const freshUser = await User.findById(user._id).select("-firebaseUid -pathFromRoot -__v");
  return { user: freshUser, profile };
}

module.exports = { synchronizeFirebaseUser, placeInMatrix };
