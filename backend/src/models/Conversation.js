const mongoose = require("mongoose");
const { Schema } = mongoose;

const conversationSchema = new Schema(
  {
    pairKey: { type: String, required: true, unique: true, immutable: true },
    members: {
      type: [{
        _id: false,
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        unread: { type: Number, default: 0, min: 0 },
        lastReadAt: { type: Date, default: null },
        typingAt: { type: Date, default: null },
      }],
      validate: { validator: (a) => a.length === 2, message: "A conversation has exactly two members" },
    },
    // Encrypted preview: only the two people can decrypt it
    lastMessage: {
      kind: { type: String, default: "text" },
      ciphertext: { type: String, default: "" },
      iv: { type: String, default: "" },
      sv: Number,
      rv: Number,
      senderId: { type: Schema.Types.ObjectId, default: null },
      at: { type: Date, default: null },
    },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
conversationSchema.index({ "members.userId": 1, lastActivityAt: -1 });

module.exports = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
