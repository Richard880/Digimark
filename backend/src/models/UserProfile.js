const mongoose = require("mongoose");

const userProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    membershipNumber: { type: String, unique: true, sparse: true, index: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true, index: true },
    firstName: { type: String, trim: true, default: "" },
    lastName: { type: String, trim: true, default: "" },
    displayName: { type: String, trim: true, default: "" },
    brandName: { type: String, trim: true, default: "" },
    bio: { type: String, trim: true, maxlength: 500, default: "" },
    profilePhoto: { type: String, default: "" },
    coverPhoto: { type: String, default: "" },
    phoneNumber: { type: String, trim: true, default: "" },
    location: {
      county: { type: String, trim: true, default: "" },
      country: { type: String, trim: true, default: "Kenya" },
    },
    marketerLevel: {
      type: String,
      enum: ["starter", "bronze", "silver", "gold", "platinum", "diamond"],
      default: "starter",
    },
    publicProfile: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserProfile", userProfileSchema);
