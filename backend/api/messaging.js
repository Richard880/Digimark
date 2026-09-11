const express = require("express");
const router = express.Router();
const fs = require("fs-extra");
const path = require("path");

const CHATS_FILE = path.join(__dirname, "..", "data", "chats.json");

// Reference to the socket instance for global access
let ioInstance = null;

// --- REST Endpoint: Get Chat History ---
router.get("/history/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!(await fs.pathExists(CHATS_FILE))) return res.json([]);

    const chats = await fs.readJson(CHATS_FILE);
    const userHistory = chats.filter(
      (m) => m.senderId === userId || m.recipientId === userId,
    );

    res.json(userHistory);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: "Could not load history" });
  }
});

/**
 * --- Socket.io Logic ---
 * This is called once by server.js to initialize the socket behavior
 */
const initSockets = (io) => {
  ioInstance = io; // Save instance so getIo() can return it

  io.on("connection", (socket) => {
    // 1. Join Personal Room
    socket.on("join_inbox", (userId) => {
      socket.join(userId);
      console.log(`📡 User ${userId} connected to personal inbox.`);
    });

    // 2. Typing Indicator
    socket.on("typing", (data) => {
      io.to(data.recipientId).emit("user_typing", {
        from: data.senderId,
        isTyping: data.isTyping,
      });
    });

    // 3. Send Encrypted Message
    socket.on("send_encrypted_msg", async (payload) => {
      // Relay to specific recipient's room
      io.to(payload.recipientId).emit("new_message", {
        from: payload.senderId,
        content: payload.encryptedBlob,
        iv: payload.iv,
      });

      // Save to JSON
      try {
        await fs.ensureFile(CHATS_FILE);
        const chats = (await fs.readJson(CHATS_FILE).catch(() => [])) || [];
        chats.push({ ...payload, timestamp: new Date().toISOString() });
        await fs.writeJson(CHATS_FILE, chats, { spaces: 2 });
      } catch (err) {
        console.error("Save error:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ User disconnected from messaging.");
    });
  });
};

/**
 * Helper to get the IO instance from other files (like video upload or register)
 * usage: const { getIo } = require('./api/messaging'); const io = getIo();
 */
const getIo = () => ioInstance;

// Export everything
module.exports = { router, initSockets, getIo };
