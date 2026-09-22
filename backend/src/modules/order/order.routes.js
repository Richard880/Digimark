const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses secure token data signatures
const authorize = require("../../middleware/authorize");       // Restricts roles where necessary

const { 
  listOrders, 
  releaseEscrowViaQrScan, 
  releaseEscrowViaPinVerification 
} = require("./order.controller");

const router = express.Router();

// 🔒 PROTECTED LOGISTICS HUB PORTAL ENDPOINTS
router.get("/", authenticate, listOrders);
router.patch("/:orderNumber/release-escrow", authenticate, releaseEscrowViaQrScan);
router.patch("/verify-release-pin", authenticate, authorize("network"), releaseEscrowViaPinVerification);

module.exports = router;
