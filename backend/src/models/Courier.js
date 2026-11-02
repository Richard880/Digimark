const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  userId: { type: Schema.Types.ObjectId, default: null },
  status: { type: String, enum: ["invited", "active", "removed"], default: "invited" },
  label: { type: String, default: "", maxlength: 40 },
  displayName: { type: String, default: "", maxlength: 80 },
  vehicleType: { type: String, enum: ["motorcycle", "car", "van", "bicycle", "on_foot"] },
  plate: { type: String, default: "", maxlength: 10 },
  codeHash: String, codeExpiresAt: Date, joinedAt: Date, removedAt: Date,
}, { timestamps: true });
schema.index({ ownerId: 1, status: 1 });
schema.index({ userId: 1, status: 1 });
schema.index({ ownerId: 1, userId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
schema.index({ codeHash: 1 }, { unique: true, partialFilterExpression: { codeHash: { $type: "string" } } });
module.exports = mongoose.models.Courier || mongoose.model("Courier", schema);
