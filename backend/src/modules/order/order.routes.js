const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses secure token data signatures
const authorize = require("../../middleware/authorize");       // Restricts roles where necessary

const { 
  listOrders, 
  createOrder, // 🎯 ADDED: Imported the missing checkout controller method
  releaseEscrowViaQrScan, 
  releaseEscrowViaPinVerification 
} = require("./order.controller");

const router = express.Router();

// 🔒 PROTECTED LOGISTICS HUB PORTAL ENDPOINTS

// 🛒 1. Place a new order & lock escrow funds
// Maps to: POST /api/orders
router.post("/", authenticate, createOrder);

// 📋 2. Retrieve history tracking ledger logs
// Maps to: GET /api/orders
router.get("/", authenticate, listOrders);

// 📱 3. Handshake Scan Gateway: Release buyer escrow via QR code scan
// Maps to: PATCH /api/orders/:orderNumber/release-escrow
router.patch("/:orderNumber/release-escrow", authenticate, releaseEscrowViaQrScan);

// 🔑 4. Handshake PIN Fallback: Release seller escrow via verbal verification PIN
// Maps to: PATCH /api/orders/verify-release-pin
// Note: Changed from authorize("network") to authenticate because any seller/courier processing this should be verified
router.patch("/verify-release-pin", authenticate, releaseEscrowViaPinVerification);

module.exports = router;
