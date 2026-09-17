const admin = require("../config/firebaseAdmin");
const User = require("../models/User");

async function authenticate(req, res, next) {
  try {
    const header = req.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const token = header.slice(7).trim();
    if (!token) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    const decoded = await admin.auth().verifyIdToken(token);
    const user = await User.findOne({ firebaseUid: decoded.uid });

    // 🎯 THE FIX: If it's the sync/registration endpoint, don't fail if the user is missing from MongoDB!
    if (!user && req.baseUrl + req.path !== "/api/auth/sync" && req.path !== "/sync") {
      return res.status(401).json({ error: "APPLICATION_USER_NOT_FOUND" });
    }
    
    if (user && !user.isActive) {
      return res.status(403).json({ error: "ACCOUNT_DISABLED" });
    }

    req.firebaseUser = decoded;
    req.user = user || null; // 🎯 Set to null gracefully if this is a brand new user signing up
    next();
  } catch (error) {
    console.error("Authentication failed:", error.code || error.message);
    return res.status(401).json({ error: "INVALID_AUTH_TOKEN" });
  }
}

module.exports = authenticate;
