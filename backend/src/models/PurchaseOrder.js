const mongoose = require("mongoose");
const { Schema } = mongoose;

const line = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, maxlength: 120 }, sku: { type: String, maxlength: 40 }, barcode: { type: String, default: "", maxlength: 32 },
    qtyOrdered: { type: Number, required: true, min: 1 },
    qtyReceived: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);
const receipt = new Schema({ ref: String, at: Date, lines: [{ _id: false, productId: Schema.Types.ObjectId, quantity: Number }] }, { _id: false });

const schema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    supplierId: { type: Schema.Types.ObjectId, required: true },
    supplierName: { type: String, required: true }, supplierPhone: { type: String, default: null },
    poNumber: { type: String, required: true, immutable: true },
    status: { type: String, enum: ["draft", "ordered", "partial", "received", "closed", "cancelled"], default: "draft" },
    lines: { type: [line], validate: (a) => a.length >= 1 && a.length <= 50 },
    total: { type: Number, required: true, min: 0 },
    expectedAt: Date, note: { type: String, default: "", maxlength: 200 },
    orderedAt: Date, receivedAt: Date, closedAt: Date,
    receipts: { type: [receipt], default: [] },
  },
  { timestamps: true }
);
schema.index({ sellerId: 1, createdAt: -1 });
schema.index({ sellerId: 1, poNumber: 1 }, { unique: true });
schema.index({ sellerId: 1, status: 1 });
module.exports = mongoose.models.PurchaseOrder || mongoose.model("PurchaseOrder", schema);
