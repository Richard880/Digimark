/**
 * 🛡️ Layer 3b Business Track & Category Authorization Guard
 * Intercepts incoming network transactions to protect route nodes.
 * @param {...string} allowedCategories - e.g., "network", "retail"
 */
function authorize(...allowedCategories) {
  return (req, res, next) => {
    // 1. Session Safeguard: Fallback if the parent authentication guard skipped hydration steps
    if (!req.user || !req.userCategory) {
      return res.status(401).json({ 
        error: "AUTHENTICATION_REQUIRED", 
        reason: "GUEST_SESSION_RESTRICTED" 
      });
    }

    // 2. Strict Account Category Verification
    if (!allowedCategories.includes(req.userCategory)) {
      console.warn(`[ACL Violation] Blocked request from account category: "${req.userCategory}"`);
      return res.status(403).json({
        error: "ACCESS_DENIED",
        reason: `TRACK_RESTRICTED: Requires (${allowedCategories.join(" or ")}) permissions. Your current account tier matches "${req.userCategory}".`
      });
    }

    // 3. Verification criteria satisfied, advance payload processing safely to the controller layer
    next();
  };
}

module.exports = authorize;
