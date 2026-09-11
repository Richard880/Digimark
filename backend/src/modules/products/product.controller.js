const crypto = require("crypto");
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");

function productCode() {
  return `SDK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function listProducts(req, res) {
  const { sellerId, shopId, status, q } = req.query;
  const filter = {};
  const requestedSeller = sellerId || shopId;

  if (requestedSeller) filter.sellerId = requestedSeller;
  if (status) filter.status = status;
  else filter.status = "LISTED";
  if (q) filter.$or = [
    { name: { $regex: q, $options: "i" } },
    { brandName: { $regex: q, $options: "i" } },
    { category: { $regex: q, $options: "i" } },
  ];

  const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
  res.json(products);
}

async function createProduct(req, res) {
  const { name, price, category, quantity, deliveryFee, description, status } = req.body;
  if (!name || price === undefined) return res.status(400).json({ error: "NAME_AND_PRICE_REQUIRED" });

  const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
  const product = await Product.create({
    productCode: productCode(),
    sellerId: req.user._id,
    name,
    brandName: profile?.brandName || profile?.displayName || "",
    category,
    price: Number(price),
    quantity: Number(quantity || 0),
    deliveryFee: Number(deliveryFee || 0),
    description,
    status: status || "READY",
    imageUrl: req.body.imageUrl || "",
  });

  res.status(201).json({ product });
}

async function updateProduct(req, res) {
  const product = await Product.findOne({ _id: req.params.id, sellerId: req.user._id });
  if (!product) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });

  const fields = ["name", "category", "description", "imageUrl", "status"];
  fields.forEach((field) => { if (req.body[field] !== undefined) product[field] = req.body[field]; });
  ["price", "quantity", "deliveryFee"].forEach((field) => {
    if (req.body[field] !== undefined) product[field] = Number(req.body[field]);
  });
  await product.save();
  res.json({ product });
}

async function deleteProduct(req, res) {
  const result = await Product.deleteOne({ _id: req.params.id, sellerId: req.user._id });
  if (!result.deletedCount) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
  res.json({ message: "Product deleted" });
}

module.exports = { listProducts, createProduct, updateProduct, deleteProduct };
