const mongoose = require("mongoose");

const shareLinkSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, immutable: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true, immutable: true },
    promoterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  },
  { timestamps: true }
);

// One link per promoter per product
shareLinkSchema.index({ productId: 1, promoterId: 1 }, { unique: true });

module.exports = mongoose.models.ShareLink || mongoose.model("ShareLink", shareLinkSchema);
