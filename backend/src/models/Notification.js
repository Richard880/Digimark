const mongoose = require("mongoose");
const { Schema } = mongoose;

const notificationSchema = new Schema(
  {
    recipientId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, required: true, maxlength: 40 },
    category: { type: String, enum: ["ESCROW", "ORDERS", "MESSAGES", "SYSTEM"], default: "SYSTEM" },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 400 },
    actionUrl: {
      type: String, default: "", maxlength: 200,
      validate: { validator: (v) => !v || (v.startsWith("/") && !v.startsWith("//")), message: "Internal links only" },
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 }); // old ones delete themselves after 90 days

module.exports = mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
