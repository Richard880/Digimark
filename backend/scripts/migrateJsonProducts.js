require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Product = require("../src/models/Product");
const User = require("../src/models/User");
const UserProfile = require("../src/models/UserProfile");

const ROOT = path.resolve(__dirname, "..");
const sources = [
  path.join(ROOT, "data", "myShop.json"),
  path.join(ROOT, "data", "market.json"),
];

function readArray(file) {
  if (!fs.existsSync(file)) return [];
  const value = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(value) ? value : [];
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const records = [];
  for (const file of sources) records.push(...readArray(file));

  let imported = 0;
  let skipped = 0;

  for (const oldProduct of records) {
    if (!oldProduct.name || oldProduct.price === undefined) {
      skipped += 1;
      continue;
    }

    const firebaseUid = oldProduct.shopId || oldProduct.userId;
    if (!firebaseUid) {
      skipped += 1;
      continue;
    }

    const seller = await User.findOne({ firebaseUid });
    if (!seller) {
      skipped += 1;
      continue;
    }

    const profile = await UserProfile.findOne({ userId: seller._id }).lean();
    const existing = await Product.findOne({ productCode: oldProduct.productCode }).lean();
    if (existing) continue;

    await Product.create({
      productCode: oldProduct.productCode || `LEGACY-${oldProduct.id}`,
      sellerId: seller._id,
      name: oldProduct.name,
      brandName: oldProduct.brandName || profile?.brandName || profile?.displayName || "",
      category: oldProduct.category || "",
      price: Number(oldProduct.price || 0),
      quantity: Number(oldProduct.quantity || 0),
      deliveryFee: Number(oldProduct.deliveryFee || 0),
      description: oldProduct.description || "",
      imageUrl: oldProduct.imageUrl || "",
      status: oldProduct.status || "READY",
      likesCount: Number(oldProduct.likesCount || 0),
      createdAt: oldProduct.createdAt ? new Date(oldProduct.createdAt) : undefined,
    });
    imported += 1;
  }

  console.log(`Product migration complete. Imported: ${imported}; skipped: ${skipped}.`);
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error("Product migration failed:", error);
  await mongoose.disconnect();
  process.exit(1);
});
