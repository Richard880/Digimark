const mongoose = require("mongoose");
const { Schema } = mongoose;

const staffSchema = new Schema(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    userId: {
      // optional link to a SokoDigi user account
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    phone: {
      type: String,
      default: "",
      maxlength: 20,
    },
    role: {
      type: String,
      enum: ["cashier", "manager", "inventory", "admin"],
      default: "cashier",
    },
    pin: {
      // 4–6 digit PIN for POS login (store hashed in production)
      type: String,
      default: null,
      select: false,
    },
    branchIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Branch",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
staffSchema.index({ sellerId: 1, isActive: 1 });
staffSchema.index({ sellerId: 1, phone: 1 }, { sparse: true });

module.exports = mongoose.models.Staff || mongoose.model("Staff", staffSchema);
