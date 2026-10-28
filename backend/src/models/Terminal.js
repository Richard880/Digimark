const mongoose = require("mongoose");
const { Schema } = mongoose;

const terminalSchema = new Schema(
  
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    branchId: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    code: {
      // short code shown on the device (e.g. T01, COUNTER-1)
      type: String,
      required: true,
      uppercase: true,
      maxlength: 10,
    },
    deviceId: {
      // browser fingerprint / native device id
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
terminalSchema.index({ sellerId: 1, isActive: 1 });
terminalSchema.index({ sellerId: 1, code: 1 }, { unique: true });

module.exports = mongoose.models.Terminal || mongoose.model("Terminal", terminalSchema);
