const express = require("express");
const router = express.Router();
const { getMyWalletDetails, handleMpesaTopUp } = require("../controllers/wallet.controller");

// 🔒 Import your existing authentication middleware
const authenticate = require("../../middleware/authenticate"); 

/**
 * 🔒 GET /api/wallet/my-balance
 * Binds the authenticated user context to fetch wallet balances safely.
 */
router.get("/my-balance", authenticate, getMyWalletDetails);

/**
 * 📲 POST /api/wallet/mpesa-topup
 * Mounts the Safaricom Daraja STK Push transaction pipeline framework.
 */
router.post("/mpesa-topup", authenticate, handleMpesaTopUp);

module.exports = router;
