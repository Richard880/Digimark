const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, maxlength: 40 },
  prefix: { type: String, required: true, immutable: true },            // first characters, so the owner can recognise a key
  hash: { type: String, required: true, unique: true, immutable: true }, // the key itself is never stored
  lastUsedAt: Date, revokedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ ownerId: 1, revokedAt: 1 });
module.exports = mongoose.models.ApiKey || mongoose.model("ApiKey", schema);
