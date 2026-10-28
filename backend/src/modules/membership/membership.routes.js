const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const authenticate = require("../../middleware/authenticate");
const { listPlans, myMembership, pay, myActivity, upgrade, entitlements } = require("./membership.controller");

const perUser = (limit) =>
  rateLimit({ windowMs: 60 * 1000, limit, keyGenerator: (req) => String(req.user._id), message: { error: "TOO_MANY_REQUESTS" } });

router.get("/plans", listPlans);
router.get("/me", authenticate, myMembership);
router.post("/pay", authenticate.strict, perUser(3), pay);
router.get("/activity", authenticate, perUser(20), myActivity);
router.get("/entitlements", authenticate, perUser(60), entitlements);
router.post("/upgrade", authenticate.strict, perUser(3), upgrade);

module.exports = router;
