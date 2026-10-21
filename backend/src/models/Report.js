const mongoose = require("mongoose");
const { Schema } = mongoose;

const schema = new Schema(
  {
    reporterId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reportedId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    conversationId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    reason: { type: String, enum: ["spam", "scam", "harassment", "inappropriate", "other"], required: true },
    details: { type: String, maxlength: 500, default: "" },
    // Text is supplied by the reporter (unverified). `fromReported` and `at` come from our own database.
    excerpt: [{ _id: false, messageId: Schema.Types.ObjectId, fromReported: Boolean, text: { type: String, maxlength: 500 }, at: Date }],
    status: { type: String, enum: ["open", "dismissed", "actioned"], default: "open" },
    resolvedBy: { type: Schema.Types.ObjectId, default: null },
    resolvedNote: { type: String, maxlength: 200, default: "" },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
schema.index({ status: 1, createdAt: -1 });
schema.index({ reportedId: 1, createdAt: -1 });

module.exports = mongoose.models.Report || mongoose.model("Report", schema);
