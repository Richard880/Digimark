const mongoose = require("mongoose");
const schema = new mongoose.Schema(
  {
    sellerId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    name: { type: String, required: true, maxlength: 80 },
    phone: { type: String, default: null },                    // 2547XXXXXXXX
    note: { type: String, default: "", maxlength: 200 },
    creditLimit: { type: Number, default: null, min: 0 },      // null = no limit
    balance: { type: Number, default: 0, validate: Number.isInteger }, // what they owe. Negative = the shop owes them (after a voided sale).
    lastCreditAt: Date,
    archived: { type: Boolean, default: false },
  },
  { timestamps: true }
);
schema.index({ sellerId: 1, name: 1 });
schema.index({ sellerId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
module.exports = mongoose.models.Customer || mongoose.model("Customer", schema);
