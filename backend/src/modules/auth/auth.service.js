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
      // Find corporate matrix zero-node root anchor
      let companyRoot = await User.findOne({
        email: "admin@sokodigi.com",
      });

      // If root doesn't exist and this is the designated
      // corporate administrator, allow initialization.
      if (!companyRoot && email?.toLowerCase() === "admin@sokodigi.com") {
        // accountType is already determined above.
      } else if (!companyRoot) {
        throw new Error(
          "MATRIX_INITIALIZATION_ERROR: Corporate anchor root user node must be seeded first."
        );
      }

      if (companyRoot) {
        let chosenSponsorId = companyRoot._id;

        // Verify custom sponsor
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

        // Find next structural vacancy
        const placement = await matrixService.findMlmPlacement(sponsorId);

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
        $push: {
          referrals: user._id,
        },
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
      {
        new: true,
      }
    );
  }

  // ============================================================
  // 3. PREPARE PROFILE DATA
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
  // 4. FIND EXISTING USER PROFILE
  // ============================================================

  let profile = await UserProfile.findOne({
    userId: user._id,
  });

  // ============================================================
  // 5. CREATE PROFILE IF IT DOESN'T EXIST
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

      // --------------------------------------------------------
      // PERSIST PROFILE IMAGE
      // --------------------------------------------------------
      photoURL:
        userData.photoURL ||
        userData.profilePic ||
        "",

      profilePic:
        userData.profilePic ||
        userData.photoURL ||
        "",
    });
  } else {
    // ==========================================================
    // 6. UPDATE EXISTING PROFILE
    // ==========================================================
    //
    // Only update values that were actually supplied.
    // This prevents a normal login/sync request from accidentally
    // erasing existing profile information.
    //
    const profileUpdates = {};

    if (userData.firstName) {
      profileUpdates.firstName = userData.firstName;
    }

    if (userData.lastName) {
      profileUpdates.lastName = userData.lastName;
    }

    if (userData.username) {
      profileUpdates.username = userData.username;
    }

    if (userData.phoneNumber) {
      profileUpdates.phoneNumber = userData.phoneNumber;
    }

    if (userData.brandName) {
      profileUpdates.brandName = userData.brandName;
    }

    if (displayName) {
      profileUpdates.displayName = displayName;
    }

    // ----------------------------------------------------------
    // PERSIST PROFILE IMAGE
    // ----------------------------------------------------------
    //
    // Accept either field name so the frontend can transition
    // safely between profilePic and photoURL.
    //
    const resolvedPhotoURL =
      userData.photoURL ||
      userData.profilePic ||
      "";

    if (resolvedPhotoURL) {
      profileUpdates.photoURL = resolvedPhotoURL;
      profileUpdates.profilePic = resolvedPhotoURL;
    }

    // Only perform MongoDB update when there is something
    // meaningful to update.
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
  // 7. RETURN FRESH DATABASE RECORDS
  // ============================================================
  //
  // Fetch the records again so the controller receives exactly
  // what is currently persisted in MongoDB.
  //

  const freshUser = await User.findById(user._id);

  const freshProfile = await UserProfile.findOne({
    userId: user._id,
  });

  return {
    user: freshUser,
    profile: freshProfile,
  };
}

// ================================================================
// EXPORT
// ================================================================

module.exports = {
  synchronizeFirebaseUser,
};
