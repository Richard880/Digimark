const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  quantity: { type: Number, default: 0, min: 0, validate: Number.isInteger },
}, { timestamps: true });
schema.index({ productId: 1, branchId: 1 }, { unique: true });
schema.index({ ownerId: 1, branchId: 1 });
module.exports = mongoose.models.BranchStock || mongoose.model("BranchStock", schema);
