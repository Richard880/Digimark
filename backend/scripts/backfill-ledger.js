// scripts/backfill-ledger.js
require("dotenv").config();
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const StockMovement = require("../src/models/StockMovement");
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for await (const p of Product.find({ quantity: { $gt: 0 } }).lean().cursor()) {
    try {
      await StockMovement.create({ sellerId: p.sellerId, productId: p._id, productName: p.name, type: "initial", delta: p.quantity, balanceAfter: p.quantity, ref: `init:${p._id}`, note: "Opening balance (migration)" });
      n++;
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  console.log(`Created ${n} opening lines`);
  await mongoose.disconnect();
})();
