require("dotenv").config();

const express = require("express");
const cors = require("cors");

const { connectDB } = require("../backend/src/lib/db");
const apiRoutes = require("../backend/src/routes");

const app = express();

const allowedOrigins = [
  "https://digimark-psi.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn("Blocked CORS origin:", origin);
    return callback(null, false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// 🎯 MOVE 1: Run the Database connection checker BEFORE routes parse incoming requests
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    return res.status(500).json({
      ok: false,
      error: "Database connection failed",
    });
  }
});

// Root check endpoints
app.get("/", (req, res) => {
  res.json({ name: "SokoDigi API", status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", database: "mongodb" });
});

// 🎯 MOVE 2: Mount the routing tree AFTER the database connection wrapper is secure
app.use("/api", apiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(500).json({
    ok: false,
    error: "INTERNAL_API_ERROR",
    message: err.message,
  });
});

module.exports = app;
