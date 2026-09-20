/**
 * 🛡️ Layer 3b Role & Category Authorization Guard
 * Enforces permission boundaries across business tracks.
 * @param {...string} allowedCategories - "network", "retail"
 */
function authorize(...allowedCategories) {
  return (req, res, next) => {
    // 1. Guest Session Safeguard: If authenticate middleware didn't find a user
    if (!req.user || !req.userCategory) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED", reason: "GUEST_ACCESS_DENIED" });
    }

    // 2. Strict Category Enforcement Rule
    if (!allowedCategories.includes(req.userCategory)) {
      return res.status(403).json({
        error: "ACCESS_DENIED",
        reason: `REQUIRED_TRACKS_MISSING: Requires (${allowedCategories.join(" or ")}) but account tier is ${req.userCategory}`
      });
    }

    next();
  };
}

module.exports = authorize;
