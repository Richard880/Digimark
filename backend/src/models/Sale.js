const mongoose = require("mongoose");
const { Schema } = mongoose;

const line = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, maxlength: 120 }, sku: { type: String, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 1 },       // before discount
    unitCost: { type: Number, default: null },                  // snapshot of the cost at sale time
    lineTotal: { type: Number, required: true, min: 0 },        // after this line's share of the discount
  },
  { _id: false }
);

const schema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    cashierId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    receiptNo: { type: String, required: true, immutable: true },
    clientRef: { type: String, required: true, immutable: true },
    lines: { type: [line], validate: (a) => a.length >= 1 && a.length <= 50 },
    subtotal: { type: Number, required: true }, discount: { type: Number, default: 0 }, total: { type: Number, required: true, min: 1 },
    paymentMethod: { type: String, enum: ["cash", "mpesa"], required: true },
    amountTendered: Number, change: Number,
    mpesaRef: { type: String, default: "", maxlength: 10 },
    customerName: { type: String, default: "", maxlength: 80 },
    note: { type: String, default: "", maxlength: 200 },
    voided: { type: Boolean, default: false }, voidedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ sellerId: 1, createdAt: -1 });
schema.index({ sellerId: 1, clientRef: 1 }, { unique: true });
schema.index({ sellerId: 1, receiptNo: 1 }, { unique: true });

module.exports = mongoose.models.Sale || mongoose.model("Sale", schema);
