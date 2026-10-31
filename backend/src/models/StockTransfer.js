const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  transferNo: { type: String, required: true, immutable: true },
  fromBranchId: Schema.Types.ObjectId, toBranchId: Schema.Types.ObjectId, fromName: String, toName: String,
  lines: [{ _id: false, productId: Schema.Types.ObjectId, name: String, quantity: Number }],
  note: { type: String, default: "", maxlength: 200 },
  byUserId: Schema.Types.ObjectId, byName: String,
  clientRef: { type: String, required: true, immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ ownerId: 1, createdAt: -1 });
schema.index({ ownerId: 1, clientRef: 1 }, { unique: true });
module.exports = mongoose.models.StockTransfer || mongoose.model("StockTransfer", schema);
