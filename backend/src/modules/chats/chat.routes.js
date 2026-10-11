const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const ChatMessage = require("../../models/ChatMessage");
const User = require("../../models/User"); // Assuming User schema holds public keys

let ioInstance = null;

// =========================================================================
// 📥 1. REST ENDPOINTS: HISTORIES & CONVERSATION INBOXES
// =========================================================================

/**
 * @route   GET /api/chats/history/:currentUserId/:targetUserId
 * @desc    Loads Chronological E2EE histories between two users
 */
router.get("/history/:currentUserId/:targetUserId", async (req, res) => {
  try {
    const { currentUserId, targetUserId } = req.params;

    if (!mongoose.isValidObjectId(currentUserId) || !mongoose.isValidObjectId(targetUserId)) {
      return res.status(400).json({ ok: false, error: "INVALID_IDENTIFIER_FORMAT" });
    }

    const history = await ChatMessage.find({
      \$or: [
        { senderId: currentUserId, recipientId: targetUserId },
        { senderId: targetUserId, recipientId: currentUserId }
      ]
    })
    .sort({ createdAt: 1 })
    .lean();

    // Reset visibility unread states on render load
    await ChatMessage.updateMany(
      { senderId: targetUserId, recipientId: currentUserId, isRead: false },
      { \$set: { isRead: true } }
    );

    return res.status(200).json({ ok: true, history });
  } catch (err) {
    console.error("❌ Thread lookup error:", err);
    return res.status(500).json({ ok: false, error: "COULD_NOT_LOAD_HISTORY" });
  }
});

/**
 * @route   GET /api/chats/inbox/:userId
 * @desc    Compiles active Messenger-style inbox threads sorted by latest activity
 */
router.get("/inbox/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const inboxFeed = await ChatMessage.aggregate([
      { \(match: {\)or: [{ senderId: userObjectId }, { recipientId: userObjectId }] } },
      { \(sort: { createdAt: -1 } },       {\)group: {
          _id: {
            \$cond: [
              { \$gt: ["\(senderId", "\)recipientId"] },
              { uid1: "\(senderId", uid2: "\)recipientId" },
              { uid1: "\(recipientId", uid2: "\)senderId" }
            ]
          },
          lastMessage: { \(first: "\)\$ROOT" }
        }
      },
      { \(replaceRoot: { newRoot: "\)lastMessage" } },
      { \$sort: { createdAt: -1 } }
    ]);

    return res.status(200).json({ ok: true, inbox: inboxFeed });
  } catch (err) {
    console.error("❌ Inbox aggregation failure:", err);
    return res.status(500).json({ ok: false, error: "FAILED_TO_COMPILE_INBOX" });
  }
});

// =========================================================================
// 📡 2. LOW-LATENCY SOCKET.IO EVENT TUNNELS
// =========================================================================
const initSockets = (io) => {
  ioInstance = io;

  io.on("connection", (socket) => {
    
    // Attach listener node to unique personal inbox room
    socket.on("join_inbox", (userId) => {
      if (userId) {
        socket.join(userId.toString());
        console.log(`📡 User ${userId} active in socket room space.`);
      }
    });

    // Real-time Typing Sync Indicators
    socket.on("typing", (data) => {
      socket.to(data.recipientId.toString()).emit("user_typing", {
        from: data.senderId,
        isTyping: data.isTyping
      });
    });

    // Encrypted Message Router and Persistence Hub
    socket.on("send_encrypted_msg", async (payload) => {
      try {
        const { senderId, recipientId, encryptedBlob, iv } = payload;

        const savedMessage = await ChatMessage.create({
          senderId,
          recipientId,
          encryptedBlob,
          iv,
          isRead: false
        });

        // Broadcast downstream directly to the recipient's tunnel room
        io.to(recipientId.toString()).emit("new_message", {
          _id: savedMessage._id,
          from: senderId,
          content: encryptedBlob,
          iv: iv,
          createdAt: savedMessage.createdAt
        });

        // Send delivery confirmation handshake status upstream to original client node
        socket.emit("message_delivered", { _id: savedMessage._id });

      } catch (err) {
        console.error("❌ Socket transactional tracking error:", err);
        socket.emit("msg_delivery_error", { error: "Failed to persist cryptographic transmission." });
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket detached from communication layer.");
    });
  });
};

const getIo = () => ioInstance;

module.exports = { router, initSockets, getIo };
