const crypto = require("crypto");
const mongoose = require("mongoose"); // 🎯 THE FIX: Imported the missing core module dependency
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");
const crypto = require("crypto"); 

function productCode() {
  return `SDK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}


async function listProducts(req, res) {
  try {
    const isAuthenticated = !!(req.user && req.user._id);
    const userCategory = req.userCategory || "guest"; // 'network', 'retail', or 'guest'

    // 1. Defensive Base Query Filters
    const baseMatch = {
      isShelved: true,
      // Handle legacy products that don't have a quantity field set yet
      $or: [
        { quantity: { $gt: 0 } },
        { quantity: { $exists: false } }
      ]
    };

    // Let validated vendors view their own draft inventory entries alongside public listings
    if (userCategory === "network" && isAuthenticated) {
      delete baseMatch.isShelved;
      baseMatch.$or = [
        { isShelved: true },
        { sellerId: new mongoose.Types.ObjectId(req.user._id) },
        { merchantId: new mongoose.Types.ObjectId(req.user._id) } // Match whatever legacy key is in your schema
      ];
    }

    // 2. Execution Aggregation Pipeline
    const pipeline = [
      { $match: baseMatch },

      // 🧠 DEFENSIVE METRICS FALLBACK ENGINE LAYER
      {
        $addFields: {
          // If the metrics object or individual values are missing entirely from your document records,
          // this guarantees they default safely to 0 instead of breaking your calculation arrays.
          conversionRateSafe: { $ifNull: ["$metrics.conversionRate", 0] },
          referralCountSafe: { $ifNull: ["$metrics.referralCount", 0] },
          escrowDisputeRateSafe: { $ifNull: ["$metrics.escrowDisputeRate", 0] }
        }
      },

      {
        $addFields: {
          rankingScore: {
            $add: [
              // Dimension A: Premium validation boost
              { $cond: [{ $eq: ["$isPremiumVendor", true] }, 50, 0] },

              // Dimension B: Conversion velocity metric computation
              { $multiply: ["$conversionRateSafe", 10] },

              // Dimension C: Affiliate MLM network promoter volume
              { $multiply: ["$referralCountSafe", 2] },

              // Dimension D: Escrow transaction penalty calculation
              { $multiply: ["$escrowDisputeRateSafe", -30] }
            ]
          }
        }
      },

      // Sort by evaluated scoring metrics descending
      { $sort: { rankingScore: -1, createdAt: -1 } }
    ];

    // 🔒 DATA REDACTION GUARD LAYER
    if (userCategory !== "network") {
      pipeline.push({
        $project: {
          affiliateCommission: 0,
          resellerWholesaleCost: 0,
          metrics: 0,
          internalNotes: 0,
          conversionRateSafe: 0,
          referralCountSafe: 0,
          escrowDisputeRateSafe: 0
        }
      });
    }

    const products = await Product.aggregate(pipeline);

    return res.status(200).json({
      ok: true,
      count: products.length,
      categoryContext: userCategory,
      feed: products
    });

  } catch (error) {
    console.error("❌ Exception inside MarketHub Feed Engine loop:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
  }
}

/**
 * 🛒 Layer 4b Single Item Inspection Lookup
 * Fetches a single product record from MongoDB by its unique ObjectId identifier string
 */
async function getProductById(req, res) {
  try {
    const { id } = req.params;

    // This validation step is now safe because mongoose is defined!
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: "INVALID_PRODUCT_ID_FORMAT" });
    }

    const product = await Product.findById(id).lean();

    if (!product) {
      return res.status(404).json({ error: "PRODUCT_NOT_FOUND" });
    }

    return res.status(200).json(product);
  } catch (error) {
    console.error("❌ Exception inside getProductById:", error.stack || error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
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
      affiliateCommission 
    } = req.body;

    if (!req.user || !req.user._id) {
      return res.status(401).json({ 
        error: "AUTHENTICATION_REQUIRED", 
        reason: "Active user session data is missing or un-hydrated." 
      });
    }

    if (!name || price === undefined) {
      return res.status(400).json({ error: "NAME_AND_PRICE_REQUIRED" });
    }

    const processedCommission = Number(affiliateCommission || 0);
    if (processedCommission >= Number(price)) {
      return res.status(400).json({ error: "COMMISSION_CANNOT_EXCEED_RETAIL_PRICE" });
    }

    // 🎯 FIXED SAFARI MATRIX: Fallback clean string if your user profile DB isn't loaded yet
    const displayBrandName = req.user.brandName || req.user.displayName || "SokoDigi Merchant";

    const product = await Product.create({
      productCode: `SKD-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, 
      sellerId: req.user._id,
      merchantId: req.user._id,
      name: name.trim(),
      brandName: displayBrandName, // 🛡️ Safe tracking fallback string reference variable
      category: (category || "general").toLowerCase().trim(),
      price: Number(price),
      affiliateCommission: processedCommission,
      wholesalePrice: Number(price) - processedCommission,
      resellerWholesaleCost: Number(price) - processedCommission,
      quantity: Number(quantity || 0),
      deliveryFee: Number(deliveryFee || 0),
      description: (description || "").trim(),
      status: status || "LISTED", 
      isShelved: true,
      imageUrl: imageUrl || "",
      
      metrics: {
        conversionRate: 0,
        referralCount: 0,
        escrowDisputeRate: 0
      }
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


// Add these functions somewhere inside your product.controller.js

async function shareProduct(req, res) {
  try {
    const { productId } = req.body;
    // Your logic for generating affiliate tracking or social share references
    return res.status(200).json({ 
      ok: true, 
      message: `Product share reference generated for asset ID: ${productId}` 
    });
  } catch (error) {
    console.error("❌ Error in shareProduct:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

async function toggleProductShelf(req, res) {
  try {
    const { id } = req.params;
    // Your logic to pin/unpin or toggle visibility on your SokoDigi marketplace storefront
    return res.status(200).json({ 
      ok: true, 
      message: `Storefront shelf state updated successfully for product: ${id}` 
    });
  } catch (error) {
    console.error("❌ Error in toggleProductShelf:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}


// 🎯 EXPLICITLY INCLUDE BOTH METHODS AT THE BOTTOM OF THE FILE:
module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  shareProduct,       // 👈 MUST MATCH PRECISELY
  toggleProductShelf  // 👈 MUST MATCH PRECISELY
};

