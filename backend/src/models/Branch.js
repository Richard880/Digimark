const mongoose = require("mongoose");
const { Schema } = mongoose;

const branchSchema = new Schema(
  {
    sellerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    address: {
      type: String,
      default: "",
      maxlength: 200,
    },
    phone: {
      type: String,
      default: "",
      maxlength: 20,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Only one primary branch per seller
branchSchema.index(
  { sellerId: 1, isPrimary: 1 },
  { unique: true, partialFilterExpression: { isPrimary: true } }
);

branchSchema.index({ sellerId: 1, isActive: 1 });

module.exports = mongoose.models.Branch || mongoose.model("Branch", branchSchema);
