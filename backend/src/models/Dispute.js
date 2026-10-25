const mongoose = require("mongoose");
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    by: { type: String, enum: ["buyer", "seller", "admin"], required: true },
    userId: { type: Schema.Types.ObjectId, default: null },
    text: { type: String, default: "", maxlength: 1000 },
    images: { type: [{ type: String, maxlength: 400 }], default: [], validate: (a) => a.length <= 3 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, unique: true, immutable: true }, // one dispute per order
    orderNumber: { type: String, required: true, immutable: true },
    buyerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    sellerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    openedBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
    openedByRole: { type: String, enum: ["buyer", "seller"], required: true, immutable: true },
    reason: { type: String, enum: ["not_received", "not_as_described", "damaged", "buyer_unresponsive", "other"], required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },
    status: { type: String, enum: ["open", "withdrawn", "refunded", "released"], default: "open" },
    messages: { type: [messageSchema], default: [] },
    resolution: { by: Schema.Types.ObjectId, note: { type: String, maxlength: 200 }, at: Date },
  },
  { timestamps: true }
);
schema.index({ status: 1, createdAt: 1 });
schema.index({ buyerId: 1, createdAt: -1 });
schema.index({ sellerId: 1, createdAt: -1 });

module.exports = mongoose.models.Dispute || mongoose.model("Dispute", schema);
