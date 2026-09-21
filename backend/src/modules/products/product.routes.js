const express = require("express");
const authenticate = require("../../middleware/authenticate"); // Parses token data variables
const authorize = require("../../middleware/authorize");       // 🎯 NEW: Verifies category rights

const { 
  listProducts, 
  createProduct, 
  updateProduct, 
  deleteProduct 
} = require("./product.controller");

const router = express.Router();

// 🛒 PUBLIC ROUTE: Anyone (Guests, Retailers, Networkers) can read the market feed catalog
router.get("/", listProducts);

// 🔒 EXCLUSIVE VENDOR ROUTES: Restricted strictly to validated "network" affiliate accounts
router.post("/", authenticate, authorize("network"), createProduct);
router.put("/:id", authenticate, authorize("network"), updateProduct);
router.delete("/:id", authenticate, authorize("network"), deleteProduct);
// 🎯 ADD THIS UNDER YOUR SECURE ROUTE LIST:
router.patch("/:id/toggle-shelf", authenticate, authorize("network"), createProduct);


module.exports = router;
