const mongoose = require("mongoose");

const memberNetworkSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    sponsorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    parentUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("MemberNetwork", memberNetworkSchema);
