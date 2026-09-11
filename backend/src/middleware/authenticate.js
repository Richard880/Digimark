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

    if (!user) return res.status(401).json({ error: "APPLICATION_USER_NOT_FOUND" });
    if (!user.isActive) return res.status(403).json({ error: "ACCOUNT_DISABLED" });

    req.firebaseUser = decoded;
    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication failed:", error.code || error.message);
    return res.status(401).json({ error: "INVALID_AUTH_TOKEN" });
  }
}

module.exports = authenticate;
