require("dotenv").config();
const path = require("path"); // 🎯 Added path utility

const express = require("express");
const cors = require("cors");

// 🎯 THE FIX: Force robust path resolution relative to the running script container root
const dbPath = path.resolve(__dirname, "../backend/src/lib/db");
const routesPath = path.resolve(__dirname, "../backend/src/routes");

const { connectDB } = require(dbPath);

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

// 🎯 THE FIX: Use the resolved absolute container directory path for your backend routes
app.use("/api", require(routesPath));

app.use((err, req, res, next) => {
  console.error("Unhandled API error:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
});

module.exports = app;
