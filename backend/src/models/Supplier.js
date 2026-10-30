const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true, maxlength: 80 },
    phone: { type: String, default: null },
    note: { type: String, default: "", maxlength: 200 },
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ sellerId: 1, name: 1 });
module.exports = mongoose.models.Supplier || mongoose.model("Supplier", schema);
