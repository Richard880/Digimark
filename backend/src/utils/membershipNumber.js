const Counter = require("../models/Counter");

async function generateMembershipNumber() {
  const counter = await Counter.findOneAndUpdate(
    { key: "membership" },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const number = 1000 + counter.value;
  return `SDK-${String(number).padStart(6, "0")}`;
}

module.exports = generateMembershipNumber;
