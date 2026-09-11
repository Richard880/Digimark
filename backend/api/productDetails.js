const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const ROOT = path.resolve(__dirname, "..");

// --- CONFIGURATION DATA ARCHIVES ---
const DB_BASE = path.join(ROOT, "data", "market.json");
const DB_FILE = path.join(ROOT, "data", "myShop.json");

/**
 * GET /api/product-details/:id
 * Fetches data for an individual inventory element by searching through active storage logs.
 */
router.get("/:id", (req, res) => {
  try {
    const productId = req.params.id;
    let fallbackArr = [];

    // 1. Crawl primary marketplace index first
    if (fs.existsSync(DB_BASE)) {
      try {
        const baseMarket = JSON.parse(fs.readFileSync(DB_BASE, "utf-8"));
        fallbackArr = fallbackArr.concat(baseMarket);
      } catch (e) {
        console.error("Error reading market.json registry:", e);
      }
    }

    // 2. Crawl unique personal studio shop records second
    if (fs.existsSync(DB_FILE)) {
      try {
        const personalShop = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
        fallbackArr = fallbackArr.concat(personalShop);
      } catch (e) {
        console.error("Error reading myShop.json registry:", e);
      }
    }

    // 3. Find the first item that matches against MongoDB hex IDs, fallback IDs, or system product codes
    const targetProduct = fallbackArr.find(
      (p) => (p._id === productId || p.id === productId || p.productCode === productId)
    );

    if (!targetProduct) {
      console.warn(`Product lookup mismatch for index code: ${productId}`);
      return res.status(404).json({ error: "Inventory element not registered." });
    }

    // Return the clean single product item record back to the React app context
    res.json(targetProduct);
  } catch (err) {
    console.error("Single Item Isolation Processing Error:", err);
    res.status(500).json({ error: "Database profile lookups interrupted." });
  }
});

module.exports = router;
