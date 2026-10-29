const mongoose = require("mongoose");

const seqSchema = new mongoose.Schema({ 
  _id: String, 
  seq: { type: Number, default: 0 } 
});

// 💡 Export the model directly instead of wrapping it in an object
module.exports = mongoose.models.Counter || mongoose.model("Counter", seqSchema);
