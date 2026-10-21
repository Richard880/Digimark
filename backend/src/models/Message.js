const mongoose = require("mongoose");
const { Schema } = mongoose;

const messageSchema = new Schema(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true, immutable: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    kind: { type: String, enum: ["text", "image"], default: "text", immutable: true },
    ciphertext: { type: String, required: true, maxlength: 10000, immutable: true }, // the server never sees the content
    iv: { type: String, required: true, immutable: true },
    sv: { type: Number, required: true, immutable: true }, // sender's key version
    rv: { type: Number, required: true, immutable: true }, // recipient's key version
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.models.Message || mongoose.model("Message", messageSchema);
