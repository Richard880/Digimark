const mongoose = require("mongoose");
const { Schema } = mongoose;
const schema = new Schema({
  ownerId: { type: Schema.Types.ObjectId, required: true, immutable: true },
  subject: { type: String, required: true, maxlength: 100 },
  category: { type: String, enum: ["billing", "inventory", "pos", "network", "other"], default: "other" },
  priority: { type: Boolean, default: false, immutable: true },
  status: { type: String, enum: ["open", "answered", "closed"], default: "open" },
  messages: { type: [{ _id: false, by: { type: String, enum: ["member", "support"] }, text: { type: String, maxlength: 2000 }, at: { type: Date, default: Date.now } }], default: [] },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.index({ ownerId: 1, lastMessageAt: -1 });
schema.index({ status: 1, priority: -1, lastMessageAt: 1 });
module.exports = mongoose.models.SupportTicket || mongoose.model("SupportTicket", schema);
