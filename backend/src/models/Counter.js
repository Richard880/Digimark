const mongoose = require("mongoose");

// Schema 1: Sequence definition
const seqSchema = new mongoose.Schema({ 
  _id: String, 
  seq: { type: Number, default: 0 } 
});

// Schema 2: Key/Value counter definition
const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
}, { timestamps: true });

// Compile separate models
const Sequence = mongoose.models.Sequence || mongoose.model("Sequence", seqSchema);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

// Export both as an object
module.exports = {
  Sequence,
  Counter
};

