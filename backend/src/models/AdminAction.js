const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, required: true },
    adminEmail: String,
    action: { type: String, required: true },
    targetType: String,
    targetId: String,
    note: { type: String, maxlength: 200 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ createdAt: -1 });

module.exports = mongoose.models.AdminAction || mongoose.model("AdminAction", schema);
