const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { perUser } = require("../../middleware/limits");
const {
  listTerminals,
  createTerminal,
  updateTerminal,
  deactivateTerminal,
  pingTerminal,
} = require("./terminal.controller");

const router = express.Router();

router.get("/", authenticate, perUser(30), listTerminals);
router.post("/", authenticate, perUser(10), createTerminal);
router.patch("/:id", authenticate, perUser(20), updateTerminal);
router.delete("/:id", authenticate, perUser(10), deactivateTerminal);
router.post("/:id/ping", authenticate, perUser(60), pingTerminal);

module.exports = router;
