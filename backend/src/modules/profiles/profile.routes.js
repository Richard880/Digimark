const express = require("express");
const { getPublicProfile } = require("./profile.controller");

const router = express.Router();
router.get("/:username", getPublicProfile);

module.exports = router;
