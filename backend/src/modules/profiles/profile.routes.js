const express = require("express");
const rateLimit = require("express-rate-limit");
const authenticate = require("../../middleware/authenticate");
const {
  getPublicProfile, getMyProfile, updateMyProfile, featureProduct, unfeatureProduct,
} = require("./profile.controller");

const router = express.Router();

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });
const perIp = rateLimit({ windowMs: 60 * 1000, limit: 60, message: { error: "TOO_MANY_REQUESTS" } });

// Signed-in routes (before /:username)
router.get("/me", authenticate, getMyProfile);
router.patch("/me", authenticate, perUser(10), updateMyProfile);
router.post("/me/featured", authenticate, perUser(20), featureProduct);
router.delete("/me/featured/:productId", authenticate, perUser(20), unfeatureProduct);

// Public
router.get("/:username", perIp, getPublicProfile);

module.exports = router;
