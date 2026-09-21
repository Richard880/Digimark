const crypto = require("crypto");
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");

function productCode() {
  return `SDK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function listProducts(req, res) {
  try {
    const { sellerId, shopId, status, q } = req.query;
    const filter = {};
    const requestedSeller = sellerId || shopId;

    if (requestedSeller) filter.sellerId = requestedSeller;
    if (status) filter.status = status;
    else filter.status = "LISTED";
    
    if (q) {
      filter.\$or = [
        { name: { regex: q, options: "i" } },
        { brandName: { regex: q, options: "i" } },
        { category: { regex: q, options: "i" } },
      ];
    }

    const products = await Product.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(products);
  } catch (error) {
    console.error("❌ Exception inside listProducts:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

async function createProduct(req, res) {
  try {
    const { 
      name, 
      price, 
      category, 
      quantity, 
      deliveryFee, 
      description, 
      status, 
      imageUrl,
      // 🎯 EXTRACT THE COMMISSION REWARD VALUE SENT FROM THE FRONTEND FORM PAYLOAD
      affiliateCommission 
    } = req.body;

    // 🛡️ THE SESSION SAFEGUARD: Bounce unauthorized or broken middleware token streams instantly
    if (!req.user || !req.user._id) {
      return res.status(401).json({ 
        error: "AUTHENTICATION_REQUIRED", 
        reason: "Active user session session token data is missing or un-hydrated." 
      });
    }

    if (!name || price === undefined) {
      return res.status(400).json({ error: "NAME_AND_PRICE_REQUIRED" });
    }

    // Double-check split margins on server-side to block security manipulation attempts
    const processedCommission = Number(affiliateCommission || 0);
    if (processedCommission >= Number(price)) {
      return res.status(400).json({ error: "COMMISSION_CANNOT_EXCEED_RETAIL_PRICE" });
    }

    // Safely perform lookups now that req.user is guaranteed to be valid
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    
    // Commit the data parameters straight into your MongoDB collection matching your schema fields
    const product = await Product.create({
      productCode: productCode(),
      sellerId: req.user._id,
      name: name.trim(),
      brandName: profile?.brandName || profile?.displayName || "SokoDigi Merchant",
      category: (category || "general").toLowerCase().trim(),
      price: Number(price),
      // 🎯 MAP THE COMMISSIONS AND WHOLESALE ARRAYS ACCURATELY FOR UPSTREAM WALLETS
      affiliateCommission: processedCommission,
      wholesalePrice: Number(price) - processedCommission,
      quantity: Number(quantity || 0),
      deliveryFee: Number(deliveryFee || 0),
      description: (description || "").trim(),
      status: status || "LISTED", // Push directly to public active feeds so it shows on MarketHub instantly
      imageUrl: imageUrl || "",
    });

    return res.status(201).json({ ok: true, product });

  } catch (error) {
    console.error("❌ Exception inside createProduct builder loop:", error.stack || error.message);
    return res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR", 
      message: error.message 
    });
  }
}

async function updateProduct(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const product = await Product.findOne({ _id: req.params.id, sellerId: req.user._id });
    if (!product) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });

    const fields = ["name", "category", "description", "imageUrl", "status"];
    fields.forEach((field) => { 
      if (req.body[field] !== undefined) product[field] = req.body[field]; 
    });

    ["price", "quantity", "deliveryFee", "affiliateCommission"].forEach((field) => {
      if (req.body[field] !== undefined) product[field] = Number(req.body[field]);
    });

    // Re-evaluate wholesale gap dynamically on product parameter update changes
    if (req.body.price !== undefined || req.body.affiliateCommission !== undefined) {
      product.wholesalePrice = product.price - product.affiliateCommission;
    }

    await product.save();
    return res.json({ product });
  } catch (error) {
    console.error("❌ Exception inside updateProduct:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

async function deleteProduct(req, res) {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    }

    const result = await Product.deleteOne({ _id: req.params.id, sellerId: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    return res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("❌ Exception inside deleteProduct:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = { listProducts, createProduct, updateProduct, deleteProduct };
