// routes/branch.routes.js
const express = require("express");
const authenticate = require("../middleware/authenticate");
const { perUser } = require("../middleware/limits"); // or your existing rate limiter
const {
  listBranches,
  createBranch,
  updateBranch,
  setPrimary,
  deactivateBranch,
} = require("../controllers/branch.controller");

const router = express.Router();

router.get("/", authenticate, perUser(30), listBranches);
router.post("/", authenticate, perUser(10), createBranch);
router.patch("/:id", authenticate, perUser(20), updateBranch);
router.post("/:id/set-primary", authenticate, perUser(10), setPrimary);
router.delete("/:id", authenticate, perUser(10), deactivateBranch);

module.exports = router;
