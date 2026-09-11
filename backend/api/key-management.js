// api/key-management.js
const express = require("express");
const router = express.Router();
const fs = require("fs-extra");
const path = require("path");

// path.resolve starts from the current file location
const USERS_FILE = path.resolve(__dirname, "..", "data", "mlm_users.json");

// 1. Endpoint to get a specific user's public key
router.get("/:userId/public-key", async (req, res) => {
  try {
    const users = await fs.readJson(USERS_FILE);
    const user = users.find((u) => u.id === req.params.userId);

    if (user && user.publicKey) {
      return res.json({ publicKey: user.publicKey });
    }
    res.status(404).json({ error: "Public key not found" });
  } catch (err) {
    console.error("Error reading users file:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 2. Endpoint to update/save a user's public key
router.post("/update-key", express.json(), async (req, res) => {
  const { userId, publicKey } = req.body;

  if (!userId || !publicKey) {
    return res.status(400).json({ error: "Missing userId or publicKey" });
  }

  console.log("Saving key for user:", req.body.userId); // LOG THIS

  try {
    const users = await fs.readJson(USERS_FILE);
    const index = users.findIndex((u) => u.id === userId);

    if (index !== -1) {
      users[index].publicKey = publicKey;
      await fs.writeJson(USERS_FILE, users, { spaces: 2 });
      return res.json({ success: true });
    }
    res.status(404).json({ error: "User not found" });
  } catch (err) {
    console.error("Error updating users file:", err);
    res.status(500).json({ error: "Error saving key" });
  }
});

module.exports = router;
