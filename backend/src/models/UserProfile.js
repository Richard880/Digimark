const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
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
 * - Persistent profile information
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
  // 1. PROCESS NEW REGISTRATION
  // ============================================================

  if (!user) {
    const accountCategory =
      userData.accountCategory === "network"
        ? "network"
        : "retail";

    const accountType =
      userData.accountType === "member"
        ? "member"
        : "user";

    let sponsorId = null;
    let parentId = null;
    let pathFromRoot = [];

    // ==========================================================
    // NETWORK AFFILIATE MATRIX INTEGRATION
    // ==========================================================

    if (accountCategory === "network") {
      // Find corporate matrix root
      let companyRoot = await User.findOne({
        email: "admin@sokodigi.com",
      });

      // Allow the designated admin to initialize the root
      if (
        !companyRoot &&
        email?.toLowerCase() === "admin@sokodigi.com"
      ) {
        // Root initialization continues below.
      } else if (!companyRoot) {
        throw new Error(
          "MATRIX_INITIALIZATION_ERROR: Corporate anchor root user node must be seeded first."
        );
      }

      if (companyRoot) {
        let chosenSponsorId = companyRoot._id;

        // Check for custom sponsor
        if (userData.sponsorUserId) {
          const customSponsor = await User.findById(
            userData.sponsorUserId
          );

          if (
            customSponsor &&
            customSponsor.accountCategory === "network"
          ) {
            chosenSponsorId = customSponsor._id;
          }
        }

        sponsorId = chosenSponsorId;

        // Find next available matrix position
        const placement =
          await matrixService.findMlmPlacement(sponsorId);

        if (!placement.ok) {
          throw new Error(
            `FORCED_MATRIX_REJECTED: ${
              placement.reason || "COMMUNITY_FULL"
            }`
          );
        }

        parentId = placement.parentId;

        // Build lineage path
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
        accountCategory === "network"
          ? "pending"
          : "active",
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
        $push: {
          referrals: user._id,
        },
      });
    }
  } else {
    // ============================================================
    // 2. RETURNING USER LOGIN
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
      {
        new: true,
      }
    );
  }

  // ============================================================
  // 3. RESOLVE PROFILE VALUES
  // ============================================================

  const firstName =
    userData.firstName ||
    displayName?.split(" ")[0] ||
    "";

  const lastName =
    userData.lastName ||
    displayName?.split(" ").slice(1).join(" ") ||
    "";

  const resolvedDisplayName =
    displayName ||
    `${firstName} ${lastName}`.trim();

  const resolvedBrandName =
    userData.brandName ||
    `${firstName} ${lastName}`.trim();

  // ============================================================
  // 4. NORMALIZE PROFILE IMAGE FIELD
  // ============================================================
  //
  // Frontend currently sends either:
  //
  //   photoURL
  //   profilePic
  //
  // MongoDB UserProfile schema uses:
  //
  //   profilePhoto
  //
  // Therefore profilePhoto becomes the single persistent
  // database source of truth.
  // ============================================================

  const resolvedProfilePhoto =
    userData.profilePhoto ||
    userData.photoURL ||
    userData.profilePic ||
    "";

  // ============================================================
  // 5. FIND EXISTING PROFILE
  // ============================================================

  let profile = await UserProfile.findOne({
    userId: user._id,
  });

  // ============================================================
  // 6. CREATE PROFILE
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

      // Persistent profile image
      profilePhoto: resolvedProfilePhoto,
    });
  } else {
    // ==========================================================
    // 7. UPDATE EXISTING PROFILE
    // ==========================================================

    const profileUpdates = {};

    // Only update fields that were actually supplied.
    // This prevents login synchronization from accidentally
    // overwriting existing profile information.

    if (userData.firstName) {
      profileUpdates.firstName =
        userData.firstName;
    }

    if (userData.lastName) {
      profileUpdates.lastName =
        userData.lastName;
    }

    if (userData.username) {
      profileUpdates.username =
        userData.username;
    }

    if (userData.phoneNumber) {
      profileUpdates.phoneNumber =
        userData.phoneNumber;
    }

    if (userData.brandName) {
      profileUpdates.brandName =
        userData.brandName;
    }

    if (displayName) {
      profileUpdates.displayName =
        displayName;
    }

    // ========================================================
    // PERSIST PROFILE PHOTO
    // ========================================================

    if (resolvedProfilePhoto) {
      profileUpdates.profilePhoto =
        resolvedProfilePhoto;
    }

    // ========================================================
    // SAVE CHANGES
    // ========================================================

    if (Object.keys(profileUpdates).length > 0) {
      profile = await UserProfile.findOneAndUpdate(
        { userId: user._id },
        {
          $set: profileUpdates,
        },
        {
          new: true,
          runValidators: true,
        }
      );
    }
  }

  // ============================================================
  // 8. FETCH FRESH DATABASE RECORDS
  // ============================================================

  const freshUser = await User.findById(user._id);

  const freshProfile = await UserProfile.findOne({
    userId: user._id,
  });

  // ============================================================
  // 9. RETURN FRESH RECORDS
  // ============================================================

  return {
    user: freshUser,
    profile: freshProfile,
  };
}

module.exports = {
  synchronizeFirebaseUser,
};
