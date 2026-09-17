const admin = require("../config/firebaseAdmin");
const User = require("../models/User");

/**
 * 🔒 Layer 3 Security Token Guard
 * Validates asymmetric Firebase identity token payloads while permitting
 * un-synchronized onboarding nodes to pass through registration endpoints.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.get("Authorization") || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const token = header.slice(7).trim();
    if (!token) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    // 1. Decrypt asymmetric token block signature against Google/Firebase public certs
    const decoded = await admin.auth().verifyIdToken(token);
    
    // 2. Query target profile presence inside MongoDB
    const user = await User.findOne({ firebaseUid: decoded.uid });

    // 🎯 THE FIX: Robustly catch Vercel's relative path mutations
    const path = req.path || "";
    const baseUrl = req.baseUrl || "";
    const isSyncEndpoint = 
      path.includes("/sync") || 
      baseUrl.includes("/sync") || 
      req.originalUrl?.includes("/sync");

    // 3. ENFORCEMENT HOLE: Fail if user is missing, EXCEPT when hitting the registration/onboarding sync path
    if (!user && !isSyncEndpoint) {
      return res.status(401).json({ error: "APPLICATION_USER_NOT_FOUND" });
    }
    
    // 4. State Security Check: Instantly drop sessions for suspended or deactivated accounts
    if (user && !user.isActive) {
      return res.status(403).json({ error: "ACCOUNT_DISABLED" });
    }

    // 5. Context Hydration
    req.firebaseUser = decoded;
    req.user = user || null; // Set to null gracefully for brand new accounts running synchronization mutations
    
    // 🎯 THE FIX: Added strict optional chaining assignment to eliminate 500 reference runtime crashes
    req.userCategory = user?.accountCategory ? user.accountCategory : "un-synchronized";

    next();
  } catch (error) {
    console.error("❌ Asymmetric Authentication Guard Security Rejection:", error.code || error.message);
    
    // Handle specific expired token signals explicitly to give the client accurate state feedback
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({ error: "AUTHENTICATION_TOKEN_EXPIRED", clearSession: true });
    }
    
    return res.status(401).json({ error: "INVALID_AUTH_TOKEN" });
  }
}

module.exports = authenticate;
