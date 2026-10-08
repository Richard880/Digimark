const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses token data variables
const authorize = require("../../middleware/authorize");       // 🎯 NEW: Verifies category rights

const { 
  listProducts,
  getProductById,
  createProduct, 
  updateProduct, 
  deleteProduct,
  shareProduct,       // 🎯 FIXED: Imported the product sharing handler
  toggleProductShelf  // 🎯 FIXED: Imported your intended shelf controller
} = require("./product.controller");

const router = express.Router();

// =========================================================================
// 🛒 1. PUBLIC APIS & SPECIFIC PATHS
// =========================================================================

// GET /api/products
router.get("/", listProducts);

// 🎯 FIXED: Mounted /share BEFORE the /:id wildcard so it doesn't cause formatting crashes
// POST /api/products/share
router.post("/share", authenticate, shareProduct);


// =========================================================================
// 🔒 2. EXCLUSIVE VENDOR ROUTES (Restricted strictly to validated "network")
// =========================================================================

// POST /api/products
router.post("/", authenticate, authorize("network"), createProduct);

// 🎯 FIXED: Correctly routes to toggleProductShelf instead of createProduct
// PATCH /api/products/:id/toggle-shelf
router.patch("/:id/toggle-shelf", authenticate, authorize("network"), toggleProductShelf);


// =========================================================================
// 🔍 3. WILDCARD PARAMETER ENDPOINTS (Must always sit at the bottom)
// =========================================================================

// GET /api/products/:id
router.get("/:id", getProductById);

// PUT /api/products/:id
router.put("/:id", authenticate, authorize("network"), updateProduct);

// DELETE /api/products/:id
router.delete("/:id", authenticate, authorize("network"), deleteProduct);

module.exports = router;
