const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses secure token signatures

const { 
  listOrders, 
  createOrder, 
  fulfillOrderEscrowHandshake // 🎯 NEW: Single unified dual-verification controller
} = require("./order.controller");


router.get("/:orderNumber/pin", authenticate, getDeliveryPin);                          // buyer only
router.patch("/:orderNumber/fulfill-handshake", authenticate.strict, completeDelivery); // seller only
router.patch("/:orderNumber/cancel", authenticate.strict, cancelOrder);
const router = express.Router();

// =========================================================================
// 🛒 1. Core Order Pipeline Execution
// =========================================================================

// Maps to: POST /api/orders (Creates order, run ACID balances, locks escrow)
router.post("/", authenticate, createOrder);

// Maps to: GET /api/orders (Retrieves order logs by buyer/seller metrics)
router.get("/", authenticate, listOrders);


// =========================================================================
// 🚚 2. Unified Escrow Release Handshake Gateway
// =========================================================================

// Maps to: PATCH /api/orders/:orderNumber/fulfill-handshake
// Accepts EITHER { "pin": "123456" } OR { "qrToken": "SDO-XXXXX" } in req.body
router.patch("/:orderNumber/fulfill-handshake", authenticate, fulfillOrderEscrowHandshake);

module.exports = router;
