require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const cookie = require("cookie");
const app = require("./app");
const connectDatabase = require("./config/database");
const notifications = require("./services/notificationService");

const PORT = Number(process.env.PORT || 3000);

async function start() {
  await connectDatabase();
  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL, // must be an explicit origin when credentials are on ("*" is rejected by browsers)
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  notifications.init(io);

  // 🔒 Authenticate every socket from the session cookie — the client no longer gets to claim a user ID.
  io.use((socket, next) => {
    try {
      const cookies = cookie.parse(socket.handshake.headers.cookie || "");
      const token = cookies.token || socket.handshake.auth?.token; // ← adjust "token" to your cookie name
      if (!token) return next(new Error("unauthorized"));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = String(payload.id || payload._id || payload.sub); // ← adjust to your JWT payload
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  // One room per user: works across multiple tabs/devices and cleans up automatically on disconnect.
  io.on("connection", (socket) => {
    socket.join(notifications.roomFor(socket.userId));
  });

  server.listen(PORT, () => console.log(`🚀 SokoDigi API running on http://localhost:${PORT}`));
}

start().catch((error) => {
  console.error("❌ Failed to start SokoDigi API:", error);
  process.exit(1);
});
