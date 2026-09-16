require("dotenv").config();
const express = require("express");
const cors = require("cors");

// 🎯 FIXED: Rely on static relative strings so Vercel can trace your files
const { connectDB } = require("../backend/src/lib/db");

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Connect DB on first request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection failed:", error);
    res.status(500).json({ error: "Database connection failed", reason: error.message });
  }
});

app.get("/", (req, res) => res.json({ name: "SokoDigi API", status: "ok" }));
app.get("/api/health", (req, res) => res.json({ status: "ok", database: "mongodb" }));

// 🎯 FIXED: Hand off routing context to your backend routes file using clean relative paths
app.use("/api", require("../backend/src/routes"));

app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

module.exports = app;
