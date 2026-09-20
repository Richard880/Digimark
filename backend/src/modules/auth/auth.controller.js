
const { synchronizeFirebaseUser } = require("./auth.service");

/**
 * 🔒 Layer 4a API Auth Controller
 *
 * Coordinates and formats payload objects before passing them
 * down to the core authentication/integration service.
 */
async function syncCurrentUser(req, res) {
  try {
   const {
  firstName,
  lastName,
  phoneNumber,
  username,
  brandName,
  accountType,
  sponsorUserId,
  accountCategory,
  profilePic,
  photoURL,
  profilePhoto,
} = req.body || {};
    // Ensure Firebase authentication middleware has populated the user.
    if (!req.firebaseUser) {
      return res.status(401).json({
        error: "UNAUTHORIZED_FIREBASE_USER",
      });
    }

    // Pass structured data to the core onboarding/synchronization service.
    const result = await synchronizeFirebaseUser({
      firebaseUid: req.firebaseUser.uid,
      email: req.firebaseUser.email,
      emailVerified: Boolean(req.firebaseUser.email_verified),
      displayName: req.firebaseUser.name || "",

      userData: {
  firstName,
  lastName,
  phoneNumber,
  username,
  brandName,
  accountType,
  sponsorUserId: sponsorUserId || null,
  accountCategory: accountCategory || "retail",

  profilePhoto:
    profilePhoto ||
    photoURL ||
    profilePic ||
    null,
},
    });

    return res.json({
      user: result.user,
      profile: result.profile,
    });
  } catch (error) {
    console.error("❌ Detailed Sync Crash Stack:", error.stack);

    return res.status(500).json({
      error: "SYNC_CONTROLLER_CRASH",
      message: error.message,
      stack: error.stack,
    });
  }
}

module.exports = {
  syncCurrentUser,
};
