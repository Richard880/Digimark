const express = require("express");
const cloudinary = require("cloudinary").v2;
const authenticate = require("../middleware/authenticate"); // Uses our verified Layer 3 guard

const router = express.Router();

// 🎯 Configure the Cloudinary core parameters using your Vercel Dashboard variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/**
 * POST /api/upload/sign
 * 🔑 Generates a secure, signed token wrapper enabling direct client-side uploads to Cloudinary
 */
router.post("/sign", authenticate, async (req, res) => {
  try {
    const { folderType } = req.body || {}; // e.g., "products" or "profiles"
    
    // Dynamically categorize the asset destination paths inside your Cloudinary console
    const targetFolder = folderType === "profiles" ? "sokodigi/profiles" : "sokodigi/products";
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Compile parameters required for the security token signature verification handshake
    const paramsToSign = {
      timestamp: timestamp,
      folder: targetFolder,
      upload_preset: "sokodigi_unsigned_preset" // Matches your Cloudinary dashboard preset name
    };

    // 🎯 THE CRYPTOGRAPHIC GUARD: Generate a signature hash using your secure backend Api Secret
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET
    );

    return res.json({
      ok: true,
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: targetFolder
    });

  } catch (error) {
    console.error("❌ Cloudinary Signing Generation Failure:", error.message);
    return res.status(500).json({ 
      error: "FAILED_TO_GENERATE_UPLOAD_SIGNATURE",
      reason: error.message 
    });
  }
});

module.exports = router;
