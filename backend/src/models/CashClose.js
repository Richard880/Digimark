const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: String, required: true },                // YYYY-MM-DD, Nairobi time
    expectedCash: { type: Number, required: true }, countedCash: { type: Number, required: true }, difference: { type: Number, required: true },
    note: { type: String, default: "", maxlength: 200 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ sellerId: 1, date: 1 }, { unique: true });
module.exports = mongoose.models.CashClose || mongoose.model("CashClose", schema);
