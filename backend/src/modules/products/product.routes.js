const express = require("express");
const authenticate = require("../../middleware/authenticate");
const { listProducts, createProduct, updateProduct, deleteProduct } = require("./product.controller");

const router = express.Router();
router.get("/", listProducts);
router.post("/", authenticate, createProduct);
router.put("/:id", authenticate, updateProduct);
router.delete("/:id", authenticate, deleteProduct);

module.exports = router;
