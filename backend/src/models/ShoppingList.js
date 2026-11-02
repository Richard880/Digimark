const mongoose = require("mongoose");
const { Schema } = mongoose;

const item = new Schema({
  productId: { type: Schema.Types.ObjectId, required: true },
  name: { type: String, maxlength: 120 },
  barcode: { type: String, default: "", maxlength: 32 },
  quantity: { type: Number, required: true, min: 1, max: 100, validate: Number.isInteger },
  mode: { type: String, enum: ["this_vendor", "auto"], default: "this_vendor" },
  approvedPrice: { type: Number, default: null },        // the unit price the buyer last verified
});

const schema = new Schema({
  buyerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  name: { type: String, required: true, maxlength: 60 },
  items: { type: [item], validate: (a) => a.length <= 30 },
  status: { type: String, enum: ["draft", "active", "paused", "needs_review", "done"], default: "draft" },
  reason: { type: String, default: "", maxlength: 30 },
  repeat: { type: String, enum: ["none", "daily", "weekly", "biweekly", "monthly"], default: "none" },
  deliveryAt: Date,
  cycle: { type: Number, default: 0 },
  precheckedFor: Date, leaseUntil: Date,
  address: { fullName: String, phoneNumber: String, county: String, subCounty: String, deliveryNotes: { type: String, default: "" } },
  consentAt: Date,
  blockedSellers: { type: [Schema.Types.ObjectId], default: [], validate: (a) => a.length <= 20 },
  lastRun: { at: Date, placed: [{ _id: false, name: String, orderNumber: String, amount: Number }], skipped: [{ _id: false, name: String, reason: String }] },
}, { timestamps: true });
schema.index({ buyerId: 1, updatedAt: -1 });
schema.index({ status: 1, deliveryAt: 1 });

module.exports = mongoose.models.ShoppingList || mongoose.model("ShoppingList", schema);
