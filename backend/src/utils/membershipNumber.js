const Counter = require("../models/Counter");

const BASE = 1000;

async function nextValue() {
  const counter = await Counter.findOneAndUpdate(
    { key: "membership" },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  if (!counter || !Number.isInteger(counter.value)) throw new Error("COUNTER_INVALID");
  return counter.value;
}

async function generateMembershipNumber() {
  let value;
  try {
    value = await nextValue();
  } catch (e) {
    // Two requests created the counter at the same moment: the loser just retries once
    if (e.code === 11000) value = await nextValue();
    else throw e;
  }
  // Never invent a number on failure. Better to fail the request than issue a duplicate ID.
  return `SDK-${String(BASE + value).padStart(6, "0")}`;
}

module.exports = generateMembershipNumber;
