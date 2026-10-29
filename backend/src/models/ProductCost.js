const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, immutable: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, immutable: true },
    costPrice: { type: Number, required: true, min: 0, validate: Number.isInteger },
  },
  { timestamps: true }
);
module.exports = mongoose.models.ProductCost || mongoose.model("ProductCost", schema);
