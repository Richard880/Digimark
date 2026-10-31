const mongoose = require("mongoose");
const { Schema } = mongoose;

const schema = new Schema(
  {
    sellerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    productId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    productName: { type: String, maxlength: 120, immutable: true },
    type: { type: String, required: true, immutable: true, enum: ["initial", "restock", "adjustment", "transfer_out", "transfer_in", "sale_marketplace", "sale_pos", "return", "void", "correction"] },
    delta: { type: Number, required: true, immutable: true, validate: Number.isInteger },
    balanceAfter: { type: Number, required: true, immutable: true, min: 0 },
    ref: { type: String, maxlength: 120, immutable: true }, // makes a retried write harmless
    note: { type: String, default: "", maxlength: 200, immutable: true },
    actorId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    branchId: { type: Schema.Types.ObjectId, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ sellerId: 1, createdAt: -1 });
schema.index({ productId: 1, createdAt: -1 });
schema.index({ ref: 1 }, { unique: true, partialFilterExpression: { ref: { $type: "string" } } });
schema.index({ sellerId: 1, branchId: 1, createdAt: -1 });


module.exports = mongoose.models.StockMovement || mongoose.model("StockMovement", schema);
