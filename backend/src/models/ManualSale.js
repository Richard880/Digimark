const mongoose = require("mongoose");
const { Schema } = mongoose;

const int = { type: Number, required: true, min: 1, validate: Number.isInteger };

const schema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true, immutable: true },
    productName: { type: String, required: true, maxlength: 120 },
    quantity: int,
    unitPrice: int,
    total: int,
    customerName: { type: String, default: "", maxlength: 80 },
    note: { type: String, default: "", maxlength: 200 },
    clientRef: { type: String, required: true, maxlength: 64, immutable: true }, // makes a double-tap or retry harmless
    voided: { type: Boolean, default: false },
    voidedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ sellerId: 1, createdAt: -1 });
schema.index({ sellerId: 1, clientRef: 1 }, { unique: true });

module.exports = mongoose.models.ManualSale || mongoose.model("ManualSale", schema);
