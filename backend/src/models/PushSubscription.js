const mongoose = require("mongoose");
const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
    keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
    userAgent: { type: String, default: "", maxlength: 200 },
    failCount: { type: Number, default: 0 },
    // Refreshed every time the app opens, so dead devices drop out after 180 days
    lastSeenAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.models.PushSubscription || mongoose.model("PushSubscription", schema);
