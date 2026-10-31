require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Branch = require("../src/models/Branch");
const Sale = require("../src/models/Sale");
const CashClose = require("../src/models/CashClose");
const CustomerEntry = require("../src/models/CustomerEntry");
const StockMovement = require("../src/models/StockMovement");
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  let n = 0;
  for await (const u of User.find({ accountCategory: "network" }).select("_id").lean().cursor()) {
    let b = await Branch.findOne({ ownerId: u._id, isMain: true }).lean();
    if (!b) b = (await Branch.create({ ownerId: u._id, name: "Main", isMain: true })).toObject();
    const none = { $exists: false };
    await Sale.updateMany({ sellerId: u._id, branchId: none }, { $set: { branchId: b._id } });
    await CashClose.updateMany({ sellerId: u._id, branchId: none }, { $set: { branchId: b._id } });
    await CustomerEntry.updateMany({ sellerId: u._id, type: "payment", branchId: none }, { $set: { branchId: b._id } });
    await StockMovement.collection.updateMany({ sellerId: u._id, branchId: none }, { $set: { branchId: b._id } }); // raw: the field is immutable in the schema
    n++;
  }
  console.log(`Done for ${n} shops`);
  await mongoose.disconnect();
})();
