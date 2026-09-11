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
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
