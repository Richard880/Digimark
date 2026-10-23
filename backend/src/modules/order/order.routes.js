const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const { listOrders, createOrder, getDeliveryPin, completeDelivery, cancelOrder, confirmOrder } = require("./order.controller");

const router = express.Router();

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });

router.get("/", authenticate, perUser(60), listOrders);
router.post("/", authenticate.strict, perUser(10), createOrder);
router.get("/:orderNumber/pin", authenticate, perUser(30), getDeliveryPin);                           // buyer only
router.patch("/:orderNumber/fulfill-handshake", authenticate.strict, perUser(10), completeDelivery);  // seller only
router.patch("/:orderNumber/cancel", authenticate.strict, perUser(10), cancelOrder);
router.patch("/:orderNumber/confirm", authenticate.strict, perUser(30), confirmOrder); // seller only

module.exports = router;
