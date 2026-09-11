const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    productCode: { type: String, required: true, unique: true, index: true },
    sellerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, index: true },
    brandName: { type: String, trim: true, default: "" },
    category: { type: String, trim: true, default: "", index: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, default: 0, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    description: { type: String, trim: true, default: "" },
    imageUrl: { type: String, default: "" },
    status: { type: String, enum: ["DRAFT", "READY", "LISTED", "ARCHIVED"], default: "READY", index: true },
    likesCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.model("Product", productSchema);
