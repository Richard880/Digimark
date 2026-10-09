const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses token data variables
const authorize = require("../../middleware/authorize");       // Verifies category rights

const { 
  listProducts,
  getPublicStoreProducts, // 🎯 Included public catalog feed stream handler
  getProductById,
  createProduct, 
  updateProduct, 
  updateProductStatus,    // 🎯 NEW: Imported status toggle controller
  purgeProductAsset,      // 🎯 NEW: Imported permanent asset purge controller
  shareProduct,       
  toggleProductShelf,
  getSmartDiscoveries 
} = require("./product.controller");

const router = express.Router();

// =========================================================================
// 🛒 1. PUBLIC APIS & SPECIFIC PATHS (Static paths must sit at the top)
// =========================================================================

// GET /api/products
router.get("/", listProducts);

// GET /api/products/public-store
router.get("/public-store", getPublicStoreProducts);

// 🧠 Smart behavioral engagement feeds (Calculates Best Sellers, Fresh Drops, Top Brands)
// Maps to: GET /api/products/discovery
router.get("/discovery", getSmartDiscoveries);

// POST /api/products/share
router.post("/share", authenticate, shareProduct);


// =========================================================================
// 🔒 2. EXCLUSIVE VENDOR ROUTES (Restricted strictly to validated "network")
// =========================================================================

// POST /api/products
router.post("/", authenticate, authorize("network"), createProduct);

// PATCH /api/products/:id/toggle-shelf
router.patch("/:id/toggle-shelf", authenticate, authorize("network"), toggleProductShelf);

// 🎯 NEW: Balanced layout status router mapping for frontend dashboard sync switches
// Maps to: PATCH /api/products/:id/status
router.patch("/:id/status", authenticate, authorize("network"), updateProductStatus);


// =========================================================================
// 🔍 3. WILDCARD PARAMETER ENDPOINTS (Must always sit at the bottom)
// =========================================================================

// GET /api/products/:id
router.get("/:id", getProductById);

// PUT /api/products/:id
router.put("/:id", authenticate, authorize("network"), updateProduct);

// 🎯 FIXED: Swapped out generic deleteProduct method to pass through your robust purge engine handler
// DELETE /api/products/:id
router.delete("/:id", authenticate, authorize("network"), purgeProductAsset);

module.exports = router;
