const { synchronizeFirebaseUser } = require("./auth.service");

async function syncCurrentUser(req, res) {
  try {
    const { firstName, lastName, phoneNumber, username, brandName, accountType, sponsorUserId } = req.body || {};
    
    // Ensure req.firebaseUser exists from the middleware pass
    if (!req.firebaseUser) {
      return res.status(401).json({ error: "UNAUTHORIZED_FIREBASE_USER" });
    }

    const result = await synchronizeFirebaseUser({
      firebaseUid: req.firebaseUser.uid,
      email: req.firebaseUser.email,
      emailVerified: Boolean(req.firebaseUser.email_verified),
      displayName: req.firebaseUser.name || "",
      userData: { firstName, lastName, phoneNumber, username, brandName, accountType, sponsorUserId },
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
      stack: error.stack
    });
  }
}

module.exports = { syncCurrentUser };
