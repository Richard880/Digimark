const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");

const router = express.Router();
const ROOT = path.resolve(__dirname, "..");

// --- CONFIGURATION ---
const IMAGES_DIR = path.join(ROOT, "storage", "public_images");
const DB_BASE = path.join(ROOT, "data", "market.json");
const DB_FILE = path.join(ROOT, "data", "myShop.json");
const INTERACTIONS_FILE = path.join(ROOT, "data", "interactions.json");
const USERS_FILE = path.join(ROOT, "data", "mlm_users.json");

const walletDataDriver = require("../data/wallets"); 

if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DB_FILE)))
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const upload = multer({ dest: os.tmpdir() });

// --- HELPERS ---
function generateProductCode() {
  return `MS-${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
}

function saveToDb(filePath, dataObj) {
  let data = [];
  if (fs.existsSync(filePath)) {
    try {
      data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (e) {
      data = [];
    }
  }
  data.push(dataObj);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- GET PERSONAL INVENTORY (FIXES THE 404 FOR /api/products) ---
router.get("/", (req, res) => {
  try {
    const { shopId } = req.query;

    if (!fs.existsSync(DB_FILE)) {
      return res.json([]);
    }

    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));

    // If shopId is provided, filter so Winfrey only sees her own inventory items
    if (shopId) {
      inventory = inventory.filter((p) => p.shopId === shopId);
    }

    res.json(inventory);
  } catch (err) {
    console.error("Fetch Inventory Error:", err);
    res.status(500).json({ error: "Failed to read inventory records" });
  }
});

// --- GET TOTAL SALES COUNT (FIXES THE 404 FOR /api/products/sales-count) ---
router.get("/sales-count", (req, res) => {
  const SALES_FILE = path.join(ROOT, "data", "sales.json");
  try {
    if (!fs.existsSync(SALES_FILE)) {
      return res.json({ count: 0 });
    }

    const salesLog = JSON.parse(fs.readFileSync(SALES_FILE, "utf-8"));

    // Sum up all quantitySold values across your sales logs
    const totalCount = salesLog.reduce(
      (sum, item) => sum + (item.quantitySold || 0),
      0,
    );

    res.json({ count: totalCount });
  } catch (err) {
    console.error("Fetch Sales Count Error:", err);
    res.status(500).json({ error: "Failed to read sales stats" });
  }
});

// --- ALGORITHMIC MARKET FEED (FACEBOOK STYLE) ---
router.get("/market", (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "USER_ID_REQUIRED" });
    }

    if (!fs.existsSync(DB_BASE)) {
      return res.json([]);
    }
    const marketProducts = JSON.parse(fs.readFileSync(DB_BASE, "utf-8"));

    if (!fs.existsSync(USERS_FILE)) {
      return res.status(500).json({ error: "Users database missing" });
    }
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const loggedInUser = users.find((u) => u.id === userId);

    if (!loggedInUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Map out the logged-in user's network connections (Sponsor, Parent, and Matrix Downlines)
    const myNetworkUserIds = new Set();
    if (loggedInUser.sponsorId) myNetworkUserIds.add(loggedInUser.sponsorId);
    if (loggedInUser.parentId) myNetworkUserIds.add(loggedInUser.parentId);

    // BFS tree loop to crawl downline nodes up to 4 matrix levels deep
    const queue = [{ id: loggedInUser.id, depth: 0 }];
    while (queue.length > 0) {
      const { id: currentId, depth } = queue.shift();
      if (depth < 4) {
        const currentUser = users.find((u) => u.id === currentId);
        if (currentUser && currentUser.referrals) {
          currentUser.referrals.forEach((referralId) => {
            myNetworkUserIds.add(referralId);
            queue.push({ id: referralId, depth: depth + 1 });
          });
        }
      }
    }

    // Extract categories user has interacted with from logs
    let userInteractedCategories = [];
    if (fs.existsSync(INTERACTIONS_FILE)) {
      try {
        const interactions = JSON.parse(
          fs.readFileSync(INTERACTIONS_FILE, "utf-8"),
        );
        userInteractedCategories = interactions
          .filter((i) => i.userId === userId)
          .map((i) => (i.category || "").toLowerCase());
      } catch (e) {
        userInteractedCategories = [];
      }
    }

    // Matrix Feed Compilation and Scoring
    const scoredFeed = marketProducts.map((product) => {
      let score = 0;
      const productCategory = (product.category || "").toLowerCase();

      // FIX: If there is no shopId, it's an independent seller. They are NEVER in the network.
      const hasValidShop = product.shopId && product.shopId.trim() !== "";
      const isFromMyNetwork = hasValidShop
        ? myNetworkUserIds.has(product.shopId)
        : false;

      // --- ALGORITHM WEIGHTING ---

      // Rule 1: Network Affinity Weight
      if (isFromMyNetwork) {
        score += 150;
      } else if (!hasValidShop) {
        // Independent sellers get a slight baseline penalty (-50) so they don't
        // crowd out the user's organic network, unless highly relevant by category.
        score -= 50;
      }

      // Rule 2: Recommendation History Engine Match (Applies to all sellers)
      const interactionCount = userInteractedCategories.filter(
        (cat) => cat === productCategory,
      ).length;
      score += interactionCount * 30;

      // Rule 3: Organic Popularity Signal
      const likes = product.likesCount || 0;
      score += likes * 5;

      // Rule 4: Time-Decay Value Score Reductions
      const itemCreatedDate = new Date(product.createdAt || Date.now());
      const hoursOld = (new Date() - itemCreatedDate) / (1000 * 60 * 60);
      score -= hoursOld * 0.75;

      return {
        ...product,
        algoScore: score,
        fromNetwork: isFromMyNetwork,
      };
    });

    // Reorder descending by final point scores
    scoredFeed.sort((a, b) => b.algoScore - a.algoScore);
    res.json(scoredFeed);
  } catch (err) {
    console.error("Market Feed Error:", err);
    res.status(500).json({ error: "Failed to generate market feed" });
  }
});

// --- RECORD USER ENGAGEMENT INTERACTION SIGNAL ---
router.post("/interact", (req, res) => {
  const { userId, category, type } = req.body;
  if (!userId || !category)
    return res.status(400).json({ error: "Missing data fields" });

  try {
    let interactions = fs.existsSync(INTERACTIONS_FILE)
      ? JSON.parse(fs.readFileSync(INTERACTIONS_FILE, "utf-8"))
      : [];

    interactions.push({
      userId,
      category,
      type: type || "click",
      timestamp: new Date().toISOString(),
    });

    if (interactions.length > 2000) interactions.shift(); // Keep storage shallow

    fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ error: "Tracking logger configuration failure" });
  }
});

// --- PRODUCT MULTIPART UPLOAD ---
router.post("/upload", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "NO_FILE" });

  const {
    shopId,
    name,
    price,
    category,
    quantity,
    deliveryFee,
    description,
    status,
  } = req.body;

  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    const brandUser = users.find((u) => u.id === shopId);

    if (!brandUser || !brandUser.parentId) {
      return res.status(403).json({ error: "ONLY_BRANDS_CAN_UPLOAD" });
    }

    const imageId = crypto.randomUUID();
    const productId = generateProductCode();
    const outputFilePath = path.join(IMAGES_DIR, `${imageId}.webp`);

    await sharp(req.file.path)
      .resize(800, 600, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputFilePath);

    const productData = {
      id: imageId,
      productCode: productId,
      name,
      price: parseFloat(price),
      category,
      quantity: parseInt(quantity),
      deliveryFee: parseFloat(deliveryFee),
      description,
      shopId: brandUser.id,
      brandName: brandUser.name,
      sponsorId: brandUser.parentId,
      imageUrl: `/public_images/${imageId}.webp`,
      status: status || "READY",
      likesCount: 0,
      createdAt: new Date().toISOString(),
    };

    saveToDb(DB_FILE, productData);

    if (productData.status === "LISTED") {
      saveToDb(DB_BASE, productData);
    }

    res.status(201).json({
      message: "Product saved successfully!",
      product: productData,
      marketSynced: productData.status === "LISTED",
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "Processing failed" });
  }
});

// --- LIST TO MARKETPLACE SYNC ---
router.post("/list-to-market", (req, res) => {
  const { productCodes } = req.body;

  try {
    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    let market = fs.existsSync(DB_BASE)
      ? JSON.parse(fs.readFileSync(DB_BASE, "utf-8"))
      : [];

    const selectedItems = [];
    inventory.forEach((p) => {
      const currentCode = p.productCode || p.id.substring(0, 8).toUpperCase();
      if (productCodes.includes(currentCode)) {
        p.status = "LISTED";
        selectedItems.push(p);
      }
    });

    fs.writeFileSync(DB_FILE, JSON.stringify(inventory, null, 2));

    selectedItems.forEach((newItem) => {
      const exists = market.find((m) => m.id === newItem.id);
      if (!exists) {
        market.push(newItem);
      } else {
        const idx = market.findIndex((m) => m.id === newItem.id);
        market[idx] = newItem;
      }
    });

    fs.writeFileSync(DB_BASE, JSON.stringify(market, null, 2));

    res.json({
      message: "Successfully listed to market",
      count: selectedItems.length,
    });
  } catch (err) {
    console.error("Market Sync Error:", err);
    res.status(500).json({ error: "Failed to sync with marketplace" });
  }
});

// --- INVENTORY ITEM DELETION ---
router.delete("/:id", (req, res) => {
  const productId = req.params.id;

  try {
    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    const initialInvCount = inventory.length;
    inventory = inventory.filter((p) => p.id !== productId);
    fs.writeFileSync(DB_FILE, JSON.stringify(inventory, null, 2));

    if (fs.existsSync(DB_BASE)) {
      let market = JSON.parse(fs.readFileSync(DB_BASE, "utf-8"));
      market = market.filter((p) => p.id !== productId);
      fs.writeFileSync(DB_BASE, JSON.stringify(market, null, 2));
    }

    if (inventory.length === initialInvCount) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted from inventory and marketplace" });
  } catch (err) {
    console.error("Delete Error:", err.message);
    res.status(500).json({ error: "Failed to delete product" });
  }
});
// --- INVENTORY UPDATE CONTROL ---
router.put("/:id", upload.single("image"), (req, res) => {
  const productId = req.params.id;
  const { name, price, category, quantity, deliveryFee, description, status } =
    req.body;

  try {
    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    let market = fs.existsSync(DB_BASE)
      ? JSON.parse(fs.readFileSync(DB_BASE, "utf-8"))
      : [];

    const index = inventory.findIndex((p) => p.id === productId);
    if (index === -1)
      return res.status(404).json({ error: "Product not found" });

    // --- HERE IS YOUR EXACT OBJECT MAPPER ---
    const updatedProduct = {
      ...inventory[index],
      name: name || inventory[index].name,
      price: price ? parseFloat(price) : inventory[index].price,
      category: category || inventory[index].category,
      quantity: quantity ? parseInt(quantity) : inventory[index].quantity,
      deliveryFee: deliveryFee
        ? parseFloat(deliveryFee)
        : inventory[index].deliveryFee,
      description: description || inventory[index].description,
      status: status || inventory[index].status,
    };

    // --- HERE IS YOUR IMAGE PROCESSING CHECK ---
    if (req.file) {
      updatedProduct.imageUrl = `/public_images/${req.file.filename}.webp`;
    }

    inventory[index] = updatedProduct;
    fs.writeFileSync(DB_FILE, JSON.stringify(inventory, null, 2));

    // --- HERE IS YOUR MARKET SYNC LOGIC ---
    const mIndex = market.findIndex((p) => p.id === productId);
    if (updatedProduct.status === "LISTED") {
      if (mIndex > -1) market[mIndex] = updatedProduct;
      else market.push(updatedProduct);
    } else {
      if (mIndex > -1) market.splice(mIndex, 1);
    }
    fs.writeFileSync(DB_BASE, JSON.stringify(market, null, 2));

    res.json({ message: "Update successful", product: updatedProduct });
  } catch (err) {
    res.status(500).json({ error: "Update failed" });
  }
});
// --- GET SALES SUMMARY (FIXED TO MATCH FRONTEND KEYS) ---
router.get("/sales-summary", (req, res) => {
  const SALES_FILE = path.join(ROOT, "data", "sales.json");
  try {
    let salesLog = [];
    if (fs.existsSync(SALES_FILE)) {
      salesLog = JSON.parse(fs.readFileSync(SALES_FILE, "utf-8"));
    }

    let inventory = [];
    if (fs.existsSync(DB_FILE)) {
      inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }

    let totalRevenue = 0;
    let totalUnitsSold = 0;

    salesLog.forEach((sale) => {
      totalUnitsSold += sale.quantitySold || 0;

      const product = inventory.find(
        (p) =>
          p.productCode === sale.productCode ||
          p.id.substring(0, 8).toUpperCase() === sale.productCode,
      );

      if (product) {
        totalRevenue += (sale.quantitySold || 0) * (product.price || 0);
      }
    });

    // MAPS EXACTLY TO YOUR FRONTEND: data.revenue and data.count
    res.json({
      revenue: totalRevenue,
      count: totalUnitsSold,
    });
  } catch (err) {
    console.error("Sales Summary Error:", err);
    res.status(500).json({ error: "Failed to compile sales summary" });
  }
});

// --- GET FULL RAW SALES HISTORY (FIXES CSV EXPORTER 404) ---
router.get("/sales-summary-full", (req, res) => {
  const SALES_FILE = path.join(ROOT, "data", "sales.json");
  try {
    let salesLog = [];
    if (fs.existsSync(SALES_FILE)) {
      salesLog = JSON.parse(fs.readFileSync(SALES_FILE, "utf-8"));
    }

    let inventory = [];
    if (fs.existsSync(DB_FILE)) {
      inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    }

    // Build the structural array rows your frontend CSV compiler loops through
    const fullSummary = salesLog.map((sale, idx) => {
      const product = inventory.find(
        (p) =>
          p.productCode === sale.productCode ||
          p.id.substring(0, 8).toUpperCase() === sale.productCode,
      );

      return {
        date: sale.timestamp || new Date().toISOString(),
        orderId: `ORD-${idx + 1000}`,
        productName: product ? product.name : "Unknown Item",
        productCode: sale.productCode,
        qtySold: sale.quantitySold,
        totalPrice: product ? sale.quantitySold * product.price : 0,
      };
    });

    res.json(fullSummary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to compile full report" });
  }
});



// --- PROCESS REVISED INTER-WALLET PRODUCT SALES LEDGER ---
router.post("/update-sales", (req, res) => {
  const { productCode, qtySold, paymentMethod, buyerEmailOrId } = req.body;
  const SALES_FILE = path.join(ROOT, "data", "sales.json");

  if (!productCode || !qtySold || !paymentMethod) {
    return res.status(400).json({ error: "Missing required tracking input fields." });
  }

  try {
    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    let market = fs.existsSync(DB_BASE) ? JSON.parse(fs.readFileSync(DB_BASE, "utf-8")) : [];
    let users = fs.existsSync(USERS_FILE) ? JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) : [];

    // Locate product target indices
    const index = inventory.findIndex(
      (p) => p.productCode === productCode || p.id.substring(0, 8).toUpperCase() === productCode
    );

    if (index === -1) return res.status(404).json({ error: "Product Code not found." });
    if (inventory[index].quantity < qtySold) return res.status(400).json({ error: "Insufficient stock quantity." });

    const targetProduct = inventory[index];
    const totalOrderCost = parseFloat(targetProduct.price) * parseInt(qtySold);
    const sellerShopId = targetProduct.shopId; // Store profile owner getting credited

    // --- MANAGE WALLET LEDGER BALANCING INTERCEPTS ---
    if (paymentMethod === "wallet") {
      if (!buyerEmailOrId) {
        return res.status(400).json({ error: "Buyer account email or user ID required." });
      }

      // Match profile across entries
      const buyerAccount = users.find(u => u.id === buyerEmailOrId || u.email === buyerEmailOrId);
      if (!buyerAccount) {
        return res.status(404).json({ error: "No registered buyer profile discovered matching that identity." });
      }

      if (buyerAccount.id === sellerShopId) {
        return res.status(400).json({ error: "Operation Blocked: You cannot purchase items from yourself using your wallet." });
      }

      // Call your native multi-wallet transfer logic
      const transferResult = walletDataDriver.transfer(buyerAccount.id, sellerShopId, totalOrderCost, {
        productCode: productCode,
        unitsSold: parseInt(qtySold),
        note: `Sokodigi Market Buy: ${targetProduct.name}`
      });

      if (!transferResult.ok) {
        return res.status(402).json({ error: `Transfer Rejected: ${transferResult.error || "INSUFFICIENT_FUNDS"}` });
      }
    }

    // --- POST COMPLETED STOCK DISPLACEMENTS ---
    inventory[index].quantity -= parseInt(qtySold);
    fs.writeFileSync(DB_FILE, JSON.stringify(inventory, null, 2));

    const mIndex = market.findIndex((p) => p.id === targetProduct.id);
    if (mIndex > -1) {
      market[mIndex].quantity = inventory[index].quantity;
      fs.writeFileSync(DB_BASE, JSON.stringify(market, null, 2));
    }

    // --- APPEND TO TRANSACTION HISTORY LEDGER ---
    let salesLog = fs.existsSync(SALES_FILE) ? JSON.parse(fs.readFileSync(SALES_FILE, "utf-8")) : [];
    salesLog.push({
      productCode,
      quantitySold: parseInt(qtySold),
      paymentMethod: paymentMethod, 
      buyerId: paymentMethod === "wallet" ? buyerEmailOrId : "Walk-in Cash Guest",
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(SALES_FILE, JSON.stringify(salesLog, null, 2));

    res.json({ 
      message: "Sale processed successfully", 
      newQuantity: inventory[index].quantity 
    });
  } catch (err) {
    console.error("Critical Sales Processing Crash:", err);
    res.status(500).json({ error: "Internal ledger balance calculation error." });
  }
});

// --- DELETE INDIVIDUAL TRANSACTION & RESTORE STOCK BALANCE ---
router.delete("/delete-sale", (req, res) => {
  const { productCode, timestamp } = req.body;
  const SALES_FILE = path.join(ROOT, "data", "sales.json");

  if (!productCode || !timestamp) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    // 1. Process files
    if (!fs.existsSync(SALES_FILE)) return res.status(404).json({ error: "No sales ledger file discovered" });
    let salesLog = JSON.parse(fs.readFileSync(SALES_FILE, "utf-8"));
    
    let inventory = JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
    let market = fs.existsSync(DB_BASE) ? JSON.parse(fs.readFileSync(DB_BASE, "utf-8")) : [];

    // 2. Locate the precise log item target match
    const targetSaleIdx = salesLog.findIndex(s => s.productCode === productCode && s.timestamp === timestamp);
    if (targetSaleIdx === -1) return res.status(404).json({ error: "Transaction record match not found" });

    const unitsToRestore = salesLog[targetSaleIdx].quantitySold;

    // 3. Rollback item stock quantities into active database states
    const invIdx = inventory.findIndex(p => p.productCode === productCode || p.id.substring(0, 8).toUpperCase() === productCode);
    if (invIdx > -1) {
      inventory[invIdx].quantity += parseInt(unitsToRestore);
      fs.writeFileSync(DB_FILE, JSON.stringify(inventory, null, 2));

      // Match changes directly inside secondary market file
      const mIdx = market.findIndex(m => m.id === inventory[invIdx].id);
      if (mIdx > -1) {
        market[mIdx].quantity = inventory[invIdx].quantity;
        fs.writeFileSync(DB_BASE, JSON.stringify(market, null, 2));
      }
    }

    // 4. Splice log history entry clean away and save records
    salesLog.splice(targetSaleIdx, 1);
    fs.writeFileSync(SALES_FILE, JSON.stringify(salesLog, null, 2));

    res.json({ success: true, message: "Transaction rolled back cleanly" });
  } catch (err) {
    console.error("Sale Record Deletion Execution Failure:", err);
    res.status(500).json({ error: "Failed to clear selected transaction record" });
  }
});


module.exports = router;
