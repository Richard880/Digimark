const crypto = require("crypto");
const mongoose = require("mongoose"); // 🎯 THE FIX: Imported the missing core module dependency
const Product = require("../../models/Product");
const UserProfile = require("../../models/UserProfile");


function productCode() {
  return `SDK-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function listProducts(req, res) {
  try {
    const isAuthenticated = !!(req.user && req.user._id);
    const userCategory = req.userCategory || "guest"; // 'network', 'retail', or 'guest'

    // 1. EXTRACT FRONTEND QUERY PARAMETERS DYNAMICALLY
    const { sellerId, status } = req.query;

    // 2. BUILD THE BASE MATCH LAYER FOR MONGOOSE AGGREGATION
    let baseMatch = {};

    if (sellerId) {
      // 🎯 IF THE DASHBOARD REQUESTS A SPECIFIC VENDOR'S STOCK:
      baseMatch.sellerId = new mongoose.Types.ObjectId(sellerId);
      
      // If status is not explicitly set to "all", filter for active listings only
      if (status !== "all") {
        baseMatch.$or = [
          { isShelved: true },
          { status: "LISTED" }
        ];
      }
    } else {
      // 🎯 IF THE REQUEST COMES FROM THE PUBLIC MARKET HUB FEED:
      baseMatch.$or = [
        { isShelved: true },
        { status: "LISTED" }
      ];

      // Exclude completely out of stock items from customer view profiles
      baseMatch.quantity = { $gt: 0 };

      // Let an authenticated vendor see their own un-shelved/draft inventory in the feed
      if (userCategory === "network" && isAuthenticated) {
        baseMatch.$or.push({ 
          sellerId: new mongoose.Types.ObjectId(req.user._id) 
        });
      }
    }

    // 3. CONSTRUCT THE PIEPLINE SCHEDULER
    const pipeline = [
      { $match: baseMatch },

      // 🧠 METRICS INTEGRITY SAFELIGHT
      {
        $addFields: {
          conversionRateSafe: { $ifNull: ["$metrics.conversionRate", 0] },
          referralCountSafe: { $ifNull: ["$metrics.referralCount", 0] },
          escrowDisputeRateSafe: { $ifNull: ["$metrics.escrowDisputeRate", 0] }
        }
      },

      {
        $addFields: {
          rankingScore: {
            $add: [
              { $cond: [{ $eq: ["$isPremiumVendor", true] }, 50, 0] },
              { $multiply: ["$conversionRateSafe", 10] },
              { $multiply: ["$referralCountSafe", 2] },
              { $multiply: ["$escrowDisputeRateSafe", -30] }
            ]
          }
        }
      },

      { $sort: { rankingScore: -1, createdAt: -1 } }
    ];

    // 🔒 PRIVACY REDACTION ENFORCEMENT
    // Do not leak wholesale metrics or margins on public feeds to guest browsers
    if (userCategory !== "network" && !sellerId) {
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

module.exports = {
  // Keep your other controller exports intact...
  listProducts
};
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

async function getSmartDiscoveries(req, res) {
  try {
    const { type, limit = 8 } = req.query;
    const userCategory = req.userCategory || "guest";

    // Base query filter limits viewable items exclusively to active storefront items
    let queryFilter = { isShelved: true, status: "LISTED", quantity: { $gt: 0 } };
    let sortCriteria = { createdAt: -1 };

    // 📊 ROUTE LOGIC MATRICES BASED ON SMART TARGETS
    switch (type) {
      case "best-sellers":
        // Target: High conversion velocity and high MLM promoter sharing distribution
        queryFilter["metrics.conversionRate"] = { $gte: 0.12 }; // Items with 12%+ conversion speed
        sortCriteria = { "metrics.conversionRate": -1, "metrics.referralCount": -1 };
        break;

      case "top-products":
        // Target: Highly reliable, premium tier vendor products with clean escrow safety histories
        queryFilter.isPremiumVendor = true;
        queryFilter["metrics.escrowDisputeRate"] = { $lt: 0.03 }; // Drop products with >3% delivery issues
        sortCriteria = { "metrics.referralCount": -1, createdAt: -1 };
        break;

      case "fresh-drops":
        // Target: Brand new marketplace catalog listings added within the current rolling week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        queryFilter.createdAt = { $gte: oneWeekAgo };
        sortCriteria = { createdAt: -1 };
        break;

      default:
        // Fallback default response: Highly shared items first
        sortCriteria = { "metrics.referralCount": -1, createdAt: -1 };
    }

    // Execute lookup with lean processing maps for lightning speed optimization
    let items = await Product.find(queryFilter)
      .sort(sortCriteria)
      .limit(Number(limit))
      .lean();

    // 🔒 PRIVACY REDACTION BOUNDARY: Strip supplier wholesale sheets from standard buyers
    if (userCategory !== "network") {
      items = items.map(({ affiliateCommission, wholesalePrice, resellerWholesaleCost, metrics, ...cleanItem }) => cleanItem);
    }

    return res.status(200).json({
      ok: true,
      smartCategory: type || "trending",
      count: items.length,
      feed: items
    });

  } catch (error) {
    console.error("❌ Smart Categories Engine operational failure:", error.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR", message: error.message });
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
  getSmartDiscoveries,
  shareProduct,       // 👈 MUST MATCH PRECISELY
  toggleProductShelf  // 👈 MUST MATCH PRECISELY
};

