const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const { syncCurrentUser, becomeMarketer, getMe } = require("./auth.controller");

const router = express.Router();

// These run before anyone has a database account, so the limit is per IP
const perIp = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, message: { error: "TOO_MANY_REQUESTS" } });

// Read-only lookup: reports whether the account exists, creates nothing
router.get("/me", authenticate.tokenOnly, perIp(60), getMe);

// Creates the database user, wallet and profile (idempotent). The user doesn't exist yet,
// so this MUST use the token-only guard, or every new signup would be rejected.
router.post("/sync", authenticate.tokenOnly, perIp(20), syncCurrentUser);

// Role change: strict guard (checks for revoked sessions too)
router.post("/become-marketer", authenticate.strict, becomeMarketer);

module.exports = router;
