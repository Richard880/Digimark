const admin = require("../config/firebaseAdmin");
const User = require("../models/User");

function bearerToken(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "");
  return m ? m[1] : null;
}

// Real token problems are 401. Anything else (DB down, network) is NOT the user's fault: 503.
function failResponse(res, err) {
  const code = err && err.code;
  if (code === "auth/id-token-expired") {
    return res.status(401).json({ error: "AUTHENTICATION_TOKEN_EXPIRED", clearSession: true });
  }
  if (code === "auth/id-token-revoked" || code === "auth/user-disabled") {
    return res.status(401).json({ error: "SESSION_REVOKED", clearSession: true });
  }
  if (typeof code === "string" && code.startsWith("auth/")) {
    return res.status(401).json({ error: "INVALID_AUTH_TOKEN" });
  }
  console.error("❌ Auth guard failure:", (err && (err.stack || err.message)) || err);
  return res.status(503).json({ error: "AUTH_TEMPORARILY_UNAVAILABLE" });
}

function build({ loadUser, checkRevoked }) {
  return async (req, res, next) => {
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });

    try {
      const decoded = await admin.auth().verifyIdToken(token, checkRevoked);
      req.firebaseUser = decoded;

      // Token-only mode (the /sync route): the app user may not exist yet
      if (!loadUser) {
        req.user = null;
        req.userCategory = "un-synchronized";
        return next();
      }

      const user = await User.findOne({ firebaseUid: decoded.uid });
      if (!user) return res.status(401).json({ error: "APPLICATION_USER_NOT_FOUND" });
      if (!user.isActive || user.membershipStatus === "suspended") {
        return res.status(403).json({ error: "ACCOUNT_DISABLED" });
      }

      req.user = user;
      // Only PAID, active members count as marketers. Pending applicants stay "retail"
      // until the fee is paid. Cancelled members keep wallet access as retail.
      const paid =
  user.membershipStatus === "active" &&
  (!user.membershipExpiresAt || user.membershipExpiresAt > new Date());
req.userCategory = user.accountCategory === "network" && paid ? "network" : "retail";
     
      req.isPendingMember = user.accountCategory === "network" && user.membershipStatus === "pending";
    } catch (err) {
      return failResponse(res, err);
    }
    return next(); // outside the try: a later handler's error is never mistaken for an auth error
  };
}

const authenticate = build({ loadUser: true, checkRevoked: false });          // normal routes
authenticate.strict = build({ loadUser: true, checkRevoked: true });          // money & role-changing routes
authenticate.tokenOnly = build({ loadUser: false, checkRevoked: false });     // /sync only

module.exports = authenticate;
