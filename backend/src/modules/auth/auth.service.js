const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile.js");
const matrixService = require("../../../services/matrixService");
const generateMembershipNumber = require("../../utils/membershipNumber");

/**
 * 🔒 Layer 4b Core Onboarding Service
 *
 * Handles:
 * - Firebase user synchronization
 * - New user creation
 * - Network/retail account routing
 * - MLM matrix placement
 * - UserProfile creation/update
 * - Persistent profile information including profile images
 */
async function synchronizeFirebaseUser({
  firebaseUid,
  email,
  emailVerified,
  displayName,
  userData = {},
}) {
  let user = await User.findOne({ firebaseUid });

  // ============================================================
  // 1. PROCESS NEW REGISTRATIONS
  // ============================================================
  if (!user) {
    const accountCategory =
      userData.accountCategory === "network" ? "network" : "retail";

    const accountType =
      userData.accountType === "member" ? "member" : "user";

    let sponsorId = null;
    let parentId = null;
    let pathFromRoot = [];

    // ==========================================================
    // NETWORK AFFILIATE MATRIX INTEGRATION
    // ==========================================================
    if (accountCategory === "network") {
      let companyRoot = await User.findOne({
        email: "admin@sokodigi.com",
      });

      if (!companyRoot && email?.toLowerCase() === "admin@sokodigi.com") {
        // accountType is already determined above.
      } else if (!companyRoot) {
        throw new Error(
          "MATRIX_INITIALIZATION_ERROR: Corporate anchor root user node must be seeded first."
        );
      }

      if (companyRoot) {
        let chosenSponsorId = companyRoot._id;

        if (userData.sponsorUserId) {
          const customSponsor = await User.findById(userData.sponsorUserId);
          if (customSponsor && customSponsor.accountCategory === "network") {
            chosenSponsorId = customSponsor._id;
          }
        }

        sponsorId = chosenSponsorId;

        const placement = await matrixService.findMlmPlacement(sponsorId);
        if (!placement.ok) {
          throw new Error(
            `FORCED_MATRIX_REJECTED: ${placement.reason || "COMMUNITY_FULL"}`
          );
        }

        parentId = placement.parentId;

        const parentUser = await User.findById(parentId)
          .select("pathFromRoot")
          .lean();

        if (parentUser) {
          pathFromRoot = [
            ...(parentUser.pathFromRoot || []),
            parentId,
          ];
        }
      }
    }

    // ==========================================================
    // CREATE USER
    // ==========================================================
    user = await User.create({
      firebaseUid,
      email,
      accountType,
      role: accountType === "member" ? "member" : "user",
      membershipStatus:
        accountCategory === "network" ? "pending" : "active",
      emailVerified,
      accountCategory,
      sponsorId,
      parentId,
      pathFromRoot,
      referrals: [],
    });

    // ==========================================================
    // ADD USER TO PARENT REFERRALS
    // ==========================================================
    if (parentId) {
      await User.findByIdAndUpdate(parentId, {
        $push: { referrals: user._id },
      });
    }
  } else {
    // ============================================================
    // 2. PROCESS RETURNING USER LOGIN
    // ============================================================
    user = await User.findOneAndUpdate(
      { firebaseUid },
      {
        $set: {
          email,
          emailVerified,
          lastLoginAt: new Date(),
        },
      },
      { new: true }
    );
  }

  // ============================================================
  // 3. PREPARE PROFILE DATA
  // ============================================================
  const firstName = userData.firstName || displayName?.split(" ")[0] || "";
  const lastName = userData.lastName || displayName?.split(" ").slice(1).join(" ") || "";

  const resolvedDisplayName = displayName || `${firstName} ${lastName}`.trim();
  const resolvedBrandName = userData.brandName || `${firstName} ${lastName}`.trim();

  // ============================================================
  // 4. NORMALIZE PROFILE IMAGE FIELD
  // ============================================================
  // 🎯 THE FIX: Extract all payload property names cleanly to match your UserProfile model
  const resolvedProfilePhoto =
    userData.profilePhoto ||
    userData.photoURL ||
    userData.profilePic ||
    "";

  // ============================================================
  // 5. FIND EXISTING USER PROFILE
  // ============================================================
  let profile = await UserProfile.findOne({ userId: user._id });

  // ============================================================
  // 6. CREATE PROFILE IF IT DOESN'T EXIST
  // ============================================================
  if (!profile) {
    const membershipNumber =
      user.accountCategory === "network"
        ? await generateMembershipNumber()
        : undefined;

    profile = await UserProfile.create({
      userId: user._id,
      membershipNumber,
      username: userData.username,
      firstName,
      lastName,
      displayName: resolvedDisplayName,
      brandName: resolvedBrandName,
      phoneNumber: userData.phoneNumber || "",
      // 🎯 THE FIX: Store explicitly inside your schema's profilePhoto field key
      profilePhoto: resolvedProfilePhoto,
    });
  } else {
    // ==========================================================
    // 7. UPDATE EXISTING PROFILE
    // ==========================================================
    const profileUpdates = {};

    if (userData.firstName) profileUpdates.firstName = userData.firstName;
    if (userData.lastName) profileUpdates.lastName = userData.lastName;
    if (userData.username) profileUpdates.username = userData.username;
    if (userData.phoneNumber) profileUpdates.phoneNumber = userData.phoneNumber;
    if (userData.brandName) profileUpdates.brandName = userData.brandName;
    if (displayName) profileUpdates.displayName = displayName;

    // 🎯 THE FIX: Write image payload links straight to profilePhoto row field on profile changes
    if (resolvedProfilePhoto) {
      profileUpdates.profilePhoto = resolvedProfilePhoto;
    }

    if (Object.keys(profileUpdates).length > 0) {
      profile = await UserProfile.findOneAndUpdate(
        { userId: user._id },
        { $set: profileUpdates },
        { new: true, runValidators: true }
      );
    }
  }

  // ============================================================
  // 8. RETURN FRESH DATABASE RECORDS
  // ============================================================
  const freshUser = await User.findById(user._id);
  const freshProfile = await UserProfile.findOne({ userId: user._id });

  return { user: freshUser, profile: freshProfile };
}

module.exports = { synchronizeFirebaseUser };
