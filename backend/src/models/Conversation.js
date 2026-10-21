const mongoose = require("mongoose");
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    // Sorted "idA_idB": one conversation per pair, enforced by the unique index
    pairKey: { type: String, required: true, unique: true, immutable: true },
    members: {
      type: [{
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        unread: { type: Number, default: 0, min: 0 },
        lastReadAt: { type: Date, default: null },
      }],
      validate: { validator: (a) => a.length === 2, message: "A conversation has exactly two members" },
    },
    lastMessage: {
      text: { type: String, default: "", maxlength: 140 },
      senderId: { type: Schema.Types.ObjectId, default: null },
      at: { type: Date, default: null },
    },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

conversationSchema.index({ "members.userId": 1, lastActivityAt: -1 });

module.exports = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
