const mongoose = require("mongoose");

const productShareSchema = new mongoose.Schema(
  {
    // The network affiliate promoter driving the in-app selling pipeline
    promoterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Reference to the original product listing object model
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    // Allows promoters to customize the display descriptions on their personal profiles
    customNotes: {
      type: String,
      maxlength: 150,
      default: ""
    }
  },
  { timestamps: true }
);

// Enforce that a marketer cannot re-pin the exact same product multiple times
productShareSchema.index({ promoterId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.models.ProductShare || mongoose.model("ProductShare", productShareSchema);
