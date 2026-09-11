const express = require("express");
const authenticate = require("../../middleware/authenticate");
const UserProfile = require("../../models/UserProfile");
const { syncCurrentUser } = require("./auth.controller");

const router = express.Router();

router.get("/me", authenticate, async (req, res) => {
  const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
  res.json({ user: req.user, profile });
});

router.post("/sync", authenticate, syncCurrentUser);

module.exports = router;
