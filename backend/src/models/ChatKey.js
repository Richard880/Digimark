const mongoose = require("mongoose");
const { Schema } = mongoose;

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, immutable: true },
    // Every public key this user has had. Peers need old ones to read old messages.
    keys: {
      type: [{ _id: false, version: { type: Number, required: true }, publicKey: { type: String, required: true }, createdAt: { type: Date, default: Date.now } }],
      default: [],
    },
    // The private key, locked with the user's passphrase in their browser. The server can't open it.
    backup: { salt: String, iv: String, data: String, iter: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.models.ChatKey || mongoose.model("ChatKey", schema);
