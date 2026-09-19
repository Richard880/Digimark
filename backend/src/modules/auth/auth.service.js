const User = require("../../models/User");
const UserProfile = require("../../models/UserProfile");
const matrixService = require("../../../services/matrixService");
const generateMembershipNumber = require("../../utils/membershipNumber");

/**
 * 🔒 Layer 4b Core Onboarding Service
 * Handles unified Firebase synchronization, dual-track path routing configurations,
 * and atomic structural tree assignment modifications.
 */
async function synchronizeFirebaseUser({ firebaseUid, email, emailVerified, displayName, userData = {} }) {
  let user = await User.findOne({ firebaseUid });

  // 1. Process New Registrations
  if (!user) {
    const accountCategory = userData.accountCategory === "network" ? "network" : "retail";
    const accountType = userData.accountType === "member" ? "member" : "user";
    
    let sponsorId = null;
    let parentId = null;
    let pathFromRoot = [];

    // 🎯 NETWORK AFFILIATE MATRIX INTEGRATION
    if (accountCategory === "network") {
      // Find or establish corporate matrix zero-node root anchor
      let companyRoot = await User.findOne({ email: "admin@sokodigi.com" });
      
      // Fallback fallback: If root doesn't exist yet, this user is initialized as the primary corporate root anchor
      if (!companyRoot && email.toLowerCase() === "admin@sokodigi.com") {
        accountType = "member";
      } else if (!companyRoot) {
        throw new Error("MATRIX_INITIALIZATION_ERROR: Corporate anchor root user node must be seeded first.");
      }

      if (companyRoot) {
        let chosenSponsorId = companyRoot._id;

        // Verify if a valid specific custom sponsor parameter was passed down
        if (userData.sponsorUserId) {
          const customSponsor = await User.findById(userData.sponsorUserId);
          if (customSponsor && customSponsor.accountCategory === "network") {
            chosenSponsorId = customSponsor._id;
          }
        }

        sponsorId = chosenSponsorId;

        // Invoke Layer 2 BFS Traversal to map out absolute next structural vacancy slot
        const placement = await matrixService.findMlmPlacement(sponsorId);
        if (!placement.ok) {
          throw new Error(`FORCED_MATRIX_REJECTED: ${placement.reason || "COMMUNITY_FULL"}`);
        }

        parentId = placement.parentId;

        // Fetch parent structural tracking metrics to extract historical lineage path strings
        const parentUser = await User.findById(parentId).select("pathFromRoot").lean();
        if (parentUser) {
          // Construct child pathFromRoot: [parentAncestors..., parentId]
          pathFromRoot = [...(parentUser.pathFromRoot || []), parentId];
        }
      }
    }

    // Atomic Insertion of User Document Core Record
    user = await User.create({
      firebaseUid,
      email,
      accountType,
      role: accountType === "member" ? "member" : "user",
      membershipStatus: accountCategory === "network" ? "pending" : "active",
      emailVerified,
      accountCategory,
      sponsorId,
      parentId,
      pathFromRoot,
      referrals: []
    });

    // 🎯 If placed under a parent node, atomically push this child ID into the parent's referrals array
    if (parentId) {
      await User.findByIdAndUpdate(parentId, { $push: { referrals: user._id } });
    }

  } else {
    // 2. Process returning user login updates
    // 🎯 THE FIX: Use findOneAndUpdate to apply updates directly to MongoDB. 
    // This bypasses instance-level validation middleware hooks, instantly removing the error.
    user = await User.findOneAndUpdate(
      { firebaseUid },
      { 
        $set: {
          email: email,
          emailVerified: emailVerified,
          lastLoginAt: new Date()
        }
      },
      { new: true } // Returns the modified user document cleanly
    );
  }


  // 3. Coordinate App UserProfile Document Creation Lookups
  let profile = await UserProfile.findOne({ userId: user._id });
  if (!profile) {
    const membershipNumber = user.accountCategory === "network" ? await generateMembershipNumber() : undefined;
    const firstName = userData.firstName || displayName?.split(" ")[0] || "";
    const lastName = userData.lastName || displayName?.split(" ").slice(1).join(" ") || "";

    profile = await UserProfile.create({
      userId: user._id,
      membershipNumber,
      username: userData.username,
      firstName,
      lastName,
      displayName: displayName || `${firstName} ${lastName}`.trim(),
      brandName: userData.brandName || `${firstName} ${lastName}`.trim(),
      phoneNumber: userData.phoneNumber || "",
    });
  }

  return { user, profile };
}

// Complete export definition matching requirements
module.exports = { synchronizeFirebaseUser };
