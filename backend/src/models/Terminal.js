const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  deviceId: { type: String, required: true, immutable: true },
  name: { type: String, default: "Till", maxlength: 40 },
  branchId: { type: Schema.Types.ObjectId },
  status: { type: String, enum: ["active", "revoked"], default: "active" },
  lastSeenAt: Date, revokedAt: Date,
}, { timestamps: true });
schema.index({ ownerId: 1, deviceId: 1 }, { unique: true });
schema.index({ ownerId: 1, status: 1 });
module.exports = mongoose.models.Terminal || mongoose.model("Terminal", schema);
