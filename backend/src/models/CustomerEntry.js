const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    type: { type: String, enum: ["credit_sale", "payment", "void_sale"], required: true, immutable: true },
    amount: { type: Number, required: true, immutable: true },       // + increases the debt, - reduces it
    balanceAfter: { type: Number, required: true, immutable: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, immutable: true },
    method: { type: String, enum: ["cash", "mpesa"], immutable: true },
    mpesaRef: { type: String, maxlength: 10, immutable: true },
    note: { type: String, default: "", maxlength: 200, immutable: true },
    ref: { type: String, maxlength: 80, immutable: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, immutable: true }, 
    actorId: { type: mongoose.Schema.Types.ObjectId, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ customerId: 1, createdAt: -1 });
schema.index({ sellerId: 1, type: 1, createdAt: -1 });
schema.index({ sellerId: 1, ref: 1 }, { unique: true, partialFilterExpression: { ref: { $type: "string" } } });
module.exports = mongoose.models.CustomerEntry || mongoose.model("CustomerEntry", schema);
