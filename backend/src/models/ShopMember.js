const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  userId: { type: Schema.Types.ObjectId, default: null },
  role: { type: String, enum: ["manager", "cashier", "stock_clerk"], required: true },
  branchIds: { type: [Schema.Types.ObjectId], default: [] }, // a manager with none can reach every branch
  status: { type: String, enum: ["invited", "active", "removed"], default: "invited" },
  label: { type: String, default: "", maxlength: 40 },
  displayName: { type: String, default: "", maxlength: 80 },
  codeHash: String, codeExpiresAt: Date, joinedAt: Date, removedAt: Date,
}, { timestamps: true });
schema.index({ ownerId: 1, status: 1 });
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: "active" } }); // one shop per person
schema.index({ codeHash: 1 }, { unique: true, partialFilterExpression: { codeHash: { $type: "string" } } });
module.exports = mongoose.models.ShopMember || mongoose.model("ShopMember", schema);
