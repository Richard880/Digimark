const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  actorId: mongoose.Schema.Types.ObjectId, actorName: String, role: String,
  action: { type: String, required: true },
  branchId: mongoose.Schema.Types.ObjectId, targetType: String, targetId: String,
  detail: { type: String, maxlength: 200 },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 365 },
});
schema.index({ ownerId: 1, createdAt: -1 });
module.exports = mongoose.models.ShopAudit || mongoose.model("ShopAudit", schema);
