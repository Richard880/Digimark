const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, maxlength: 60 },
  address: { type: String, default: "", maxlength: 200 },
  isMain: { type: Boolean, default: false, immutable: true },
  archived: { type: Boolean, default: false },
}, { timestamps: true });
schema.index({ ownerId: 1, archived: 1 });
schema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { isMain: true } }); // one main branch per shop
module.exports = mongoose.models.Branch || mongoose.model("Branch", schema);
