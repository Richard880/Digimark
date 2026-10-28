const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits"); // adjust if your limiter is elsewhere
const {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
} = require("./staff.controller");

const router = express.Router();

router.get("/", authenticate, perUser(30), listStaff);
router.post("/", authenticate, perUser(10), createStaff);
router.patch("/:id", authenticate, perUser(20), updateStaff);
router.delete("/:id", authenticate, perUser(10), deactivateStaff);

module.exports = router;
