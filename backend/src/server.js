require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const connectDatabase = require("./config/database");
const admin = require("./config/firebaseAdmin");
const User = require("./models/User");
const notifications = require("./services/notification.service");

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await connectDatabase();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: (process.env.CLIENT_URL || "").split(",").map((s) => s.trim()).filter(Boolean),
      methods: ["GET", "POST"],
      credentials: true,
    },
    maxHttpBufferSize: 1e5, // 100 KB: these sockets only push notifications down to the browser
  });
  notifications.init(io);

  // Authenticate every socket with the SAME Firebase token the API uses.
  // The client never gets to say who it is.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (typeof token !== "string" || !token) return next(new Error("unauthorized"));
      const decoded = await admin.auth().verifyIdToken(token);
      const user = await User.findOne({ firebaseUid: decoded.uid }).select("_id isActive membershipStatus").lean();
      if (!user || !user.isActive || user.membershipStatus === "suspended") return next(new Error("unauthorized"));
      socket.userId = String(user._id);
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  // One private room per user, joined automatically, and nothing the client sends is ever trusted
  io.on("connection", (socket) => {
    socket.join(notifications.roomFor(socket.userId));
  });

  server.listen(PORT, () => console.log(`🚀 SokoDigi API running on port ${PORT}`));
}

start().catch((error) => {
  console.error("❌ Failed to start SokoDigi API:", error);
  process.exit(1);
});
