const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, immutable: true },
  logo: { type: String, default: "", maxlength: 400 }, footer: { type: String, default: "", maxlength: 120 },
  phone: { type: String, default: "", maxlength: 20 }, taxPin: { type: String, default: "", maxlength: 11 },
}, { timestamps: true });
module.exports = mongoose.models.ShopSettings || mongoose.model("ShopSettings", schema);
