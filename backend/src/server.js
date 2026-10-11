require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const http = require("http");
const { Server } = require("socket.io"); // 🎯 INJECTED SOCKET.IO ENGINE
const app = require("./app");
const connectDatabase = require("./config/database");

const PORT = Number(process.env.PORT || 3000);

// Global memory map linking active User IDs straight to live WebSocket connection channels
const activeConnections = new Map();

// Placeholder reference to share the live IO instance globally
let ioInstance = null;

async function start() {
  await connectDatabase();
  const server = http.createServer(app);

  // 🎯 INITIALIZE REAL-TIME SOCKET SERVER TUNNEL
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || "*", // Automatically accepts your live deployed frontend layout
      methods: ["GET", "POST"]
    }
  });
  ioInstance = io;

  // 🔌 ESTABLISH LIVE EVENT HANDSHAKES
  io.on("connection", (socket) => {
    // Let the client map its authenticated User ID to this live socket tunnel
    socket.on("register-user", (userId) => {
      if (userId) {
        activeConnections.set(userId, socket.id);
        console.log(`[Notification Engine] Mapped user session: ${userId} -> ${socket.id}`);
      }
    });

    socket.on("disconnect", () => {
      for (let [userId, socketId] of activeConnections.entries()) {
        if (socketId === socket.id) {
          activeConnections.delete(userId);
          console.log(`[Notification Engine] Cleared session for user: ${userId}`);
          break;
        }
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 SokoDigi API running on http://localhost:${PORT}`);
  });
}

/**
 * 🎯 GLOBAL ACTION TRIGGER
 * Exported helper function called from your backend controllers to dispatch live alerts
 */
const dispatchNotification = async (recipientId, data) => {
  try {
    // 1. Persist the log directly into your database using your specific relative path syntax
    const Notification = require("../models/Notification");
    const savedNotification = await Notification.create({ recipientId, ...data });

    // 2. If the targeted buyer or supplier is actively online, push it onto their screen instantly
    if (ioInstance) {
      const targetSocketId = activeConnections.get(recipientId);
      if (targetSocketId) {
        ioInstance.to(targetSocketId).emit("incoming-notification", savedNotification);
        console.log(`[Notification Engine] Dispatched live alert straight to socket client: ${targetSocketId}`);
      }
    }
  } catch (err) {
    console.error("❌ Critical error firing platform alert asset:", err);
  }
};

start().catch((error) => {
  console.error("❌ Failed to start SokoDigi API:", error);
  process.exit(1);
});

// Export the driver so your M-PESA escrow controllers can access it seamlessly
module.exports = { dispatchNotification };
