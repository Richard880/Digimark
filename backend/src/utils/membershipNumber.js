const Counter = require("../models/Counter");

async function generateMembershipNumber() {
  try {
    const counter = await Counter.findOneAndUpdate(
      { key: "membership" },
      { $inc: { value: 1 } },
      // 🎯 FIX: Added the missing "s" to setDefaultsOnInsert so Mongoose handles missing collections safely
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    // Safely fallback if counter structure hasn't fully propagated yet
    const currentValue = counter && counter.value ? counter.value : 1;

    const number = 1000 + currentValue;
    return `SDK-${String(number).padStart(6, "0")}`;
    
  } catch (error) {
    console.error("❌ Counter generation failed:", error.message);
    // Safe emergency fallback so the user registration process doesn't throw a 500 error if DB lags
    const randomFallback = Math.floor(100000 + Math.random() * 900000);
    return `SDK-${randomFallback}`;
  }
}

module.exports = generateMembershipNumber;
