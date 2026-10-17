const express = require("express");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const cloudinary = require("cloudinary").v2;
const authenticate = require("../middleware/authenticate");

for (const k of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"]) {
  if (!process.env[k]) throw new Error(`Missing env ${k}`);
}
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const router = express.Router();

const FOLDERS = { products: "sokodigi/products", profiles: "sokodigi/profiles" };

// Runs after authenticate, so each user gets their own allowance
const signLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: (req) => String(req.user._id),
  message: { error: "TOO_MANY_REQUESTS" },
});

/**
 * POST /api/upload/sign   body: { folderType: "products" | "profiles" }
 * Returns a one-time permit: only these exact parameters will be accepted by Cloudinary.
 */
router.post("/sign", authenticate, signLimiter, (req, res) => {
  try {
    const folderType = req.body && req.body.folderType;
    if (typeof folderType !== "string" || !Object.prototype.hasOwnProperty.call(FOLDERS, folderType)) {
      return res.status(400).json({ error: "INVALID_FOLDER_TYPE" });
    }
    // Product photos: only active, paid members. Profile photos: any signed-in user.
    if (folderType === "products" && req.userCategory !== "network") {
      return res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" });
    }

    const uploadParams = {
      timestamp: Math.round(Date.now() / 1000),
      folder: FOLDERS[folderType],
      public_id: `${req.user._id}_${crypto.randomBytes(8).toString("hex")}`, // server-chosen: unguessable and owned by this user
      allowed_formats: "jpg,png,webp",
      overwrite: "false",
      transformation: "c_limit,w_1600,h_1600", // shrinks anything larger on upload
    };
    const signature = cloudinary.utils.api_sign_request(uploadParams, process.env.CLOUDINARY_API_SECRET);

    res.set("Cache-Control", "no-store");
    return res.json({
      ok: true,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY, // public by design; the secret never leaves the server
      signature,
      uploadParams,
    });
  } catch (e) {
    console.error("❌ upload sign:", e.stack || e.message); // log it, never send it
    return res.status(500).json({ error: "FAILED_TO_GENERATE_UPLOAD_SIGNATURE" });
  }
});

module.exports = router;
