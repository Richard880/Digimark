const { synchronizeFirebaseUser } = require("./auth.service");

/**
 * 🔒 Layer 4a API Auth Controller
 * Coordinates and formats payload objects before passing them down the integration pipeline.
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
      accountCategory // 🎯 NEW: Intercept user tracking category ("retail" vs "network")
    } = req.body || {};
    
    // Ensure req.firebaseUser exists from the middleware pass
    if (!req.firebaseUser) {
      return res.status(401).json({ error: "UNAUTHORIZED_FIREBASE_USER" });
    }

    // Pass structured data down to core onboarding service tier
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
        // Fallback safely to retail to shield forced-matrix tree calculations from structural damage
        accountCategory: accountCategory || "retail" 
      },
    });

    return res.json({
      user: result.user,
      profile: result.profile,
    });
    
  } catch (error) {
    console.error("❌ Crash in syncCurrentUser:", error);
    
    // 🎯 THE FIX: Catch the error and pass the exact message back to your browser screen
    return res.status(500).json({
      error: "SYNC_CONTROLLER_CRASH",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
}

module.exports = { syncCurrentUser };
