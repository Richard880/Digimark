const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
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

    // ==========================================
    // 🎯 🛡️ NEW DUAL-TRACK & MATRIX FIELDS
    // ==========================================
    accountCategory: {
      type: String,
      enum: ["retail", "network"],
      required: true,
      default: "retail",
      index: true,
    },
    // The direct sales sponsor (Who brought them into SokoDigi)
    sponsorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // The structural tree parent (Where the matrix engine auto-placed them)
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Immediate child legs underneath this node (max 10 based on MAX_DIRECT)
    referrals: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
    // High-Performance Materialized Path Array (All ancestors up to the corporate root node)
    // Turns recursive tree scanning lookups into single database queries
    pathFromRoot: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
      index: true,
    },
  },
  { timestamps: true }
);

// =========================================================================
// 🔒 DATA INTEGRITY VALIDATION GUARD (Pre-Save Middleware Hook)
// =========================================================================
userSchema.pre("save", function (next) {
  // If user is a standard retail shopper, force-wipe any matrix tracking properties
  if (this.accountCategory === "retail") {
    this.sponsorId = null;
    this.parentId = null;
    this.referrals = [];
    this.pathFromRoot = [];
  }

  // Enforce structural boundary rules for Network Members
  if (this.accountCategory === "network" && this.referrals.length > 10) {
    return next(new Error("MATRIX_INTEGRITY_VIOLATION: Referrals array cannot exceed MAX_DIRECT (10 legs)."));
  }

  next();
});

module.exports = mongoose.model("User", userSchema);
