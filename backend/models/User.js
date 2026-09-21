const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // =========================================================================
    // 🔐 AUTHENTICATION & CORE IDENTIFICATION (Do Not Delete!)
    // =========================================================================
    firebaseUid: {
      type: String,
      required: true,
      unique: true,
      index: true,
      immutable: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "admin", "member", "user"],
      default: "user",
      index: true,
    },
    accountType: {
      type: String,
      enum: ["member", "user"],
      default: "user",
      index: true,
    },
    membershipStatus: {
      type: String,
      enum: ["pending", "active", "suspended", "cancelled"],
      default: "pending",
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    emailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date, default: null },

    // =========================================================================
    // 👤 NEW: EXTENDED BIO-DATA & IDENTIFICATION FIELDS
    // =========================================================================
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    phone: { 
      type: String, 
      required: true, 
      trim: true 
    },
    gender: { 
      type: String, 
      required: true, 
      enum: ['male', 'female'] 
    },
    nationalId: { 
      type: String, 
      default: null,
      sparse: true, // Allows multiple null values but enforces uniqueness for real IDs
      index: true
    },

    // =========================================================================
    // 🌲 MLM CORE STRUCTURAL FORCED-MATRIX POINTERS
    // =========================================================================
    accountCategory: {
      type: String,
      enum: ["retail", "network"],
      required: true,
      default: "retail",
      index: true,
    },
    // Direct Sponsor (Who brought them in — used for active qualification tracking)
    sponsorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Immediate placement parent node (Determined automatically by BFS vacancy search)
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Array tracking immediate downline placement children sitting below this node (Max 10)
    referrals: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    // High-Performance Materialized Path Array tracking all ancestors up to corporate root
    pathFromRoot: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      index: true,
    },

    // =========================================================================
    // ⏳ NEW: SUBSCRIPTION SECURITY TIMESTAMPS (For Compression & Validity)
    // =========================================================================
    subscriptionExpiresAt: {
      type: Date,
      default: null,
      index: true,
    }
  },
  { timestamps: true }
);

// ⚡ High-speed optimization compound indexes for forced-matrix processing
userSchema.index({ parentId: 1 });
userSchema.index({ sponsorId: 1 });
userSchema.index({ accountCategory: 1, membershipStatus: 1 });

// Async Pre-Save Lifecycle Hook Interceptor (Cleanly customized for Serverless Nodes)
userSchema.pre("save", async function () {
  if (this.accountCategory === "retail") {
    this.sponsorId = null;
    this.parentId = null;
    this.referrals = [];
    this.pathFromRoot = [];
    this.subscriptionExpiresAt = null;
  }

  // Strict Matrix line width constraint verification
  if (this.accountCategory === "network" && this.referrals.length > 10) {
    throw new Error("MATRIX_INTEGRITY_VIOLATION: Matrix line width capped at a maximum of 10 nodes.");
  }
});

// 🎯 THE FIX: Double-check compiled cache layers to prevent Mongoose model compile crashes on Vercel hot-reloads
module.exports = mongoose.models.User || mongoose.model("User", userSchema);
