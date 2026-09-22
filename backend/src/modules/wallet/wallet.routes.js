const express = require("express");
const router = express.Router();
const { getMyWalletDetails } = require("./wallet.controller");

// 🔒 Import your existing authentication middleware
// Adjust the path below if your authenticate/requireUser middleware is located elsewhere
const authenticate = require("../../middleware/authenticate"); 

/**
 * 🔒 GET /api/wallet/my-balance
 * Binds the authenticated user context to the controller to fetch wallet balances safely.
 */
router.get("/my-balance", authenticate, getMyWalletDetails);

module.exports = router;
