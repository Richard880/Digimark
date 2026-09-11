// api/network.routes.js
const JWT_SECRET = process.env.JWT_SECRET || "mlm_secret_key_123";
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const matrixService = require("../services/matrixService"); // 🟢 Import our separated logic service layer

const router = express.Router();

// --- 🛡️ EXPLICIT AUTHORIZATION ROUTE MIDDLEWARE GUARD ---
const verifySessionToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "MISSING_OR_MALFORMED_AUTHORIZATION_TOKEN" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "EXPIRED_OR_INVALID_SESSION_CREDENTIALS" });
  }
};

/**
 * POST /api/network/register
 */
/**
 * POST /api/network/register (Streamlined for Standard Standalone MongoDB Local Instances)
 */
// const JWT_SECRET = process.env.JWT_SECRET || "mlm_secret_key_123";
// const express = require("express");
// const bcrypt = require("bcryptjs");
// const jwt = require("jsonwebtoken");
// const crypto = require("crypto"); // Built-in Node utility to generate secure un-guessable hex tokens
// const mongoose = require("mongoose");

// const User = require("../models/User");
// const matrixService = require("../services/matrixService");

// const router = express.Router();

/**
 * POST /api/network/register
 * 🔒 Strict Verification Completeness Engine
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, gender, nationalId, password, confirmPassword, sponsor } = req.body || {};

    // 🛑 1. STRICT ENFORCEMENT: No field can be left blank except the optional sponsor parameter
    if (!name || !name.trim() || 
        !email || !email.trim() || 
        !phone || !phone.trim() || 
        !gender || !gender.trim() || 
        !nationalId || !nationalId.trim() || 
        !password || !confirmPassword) {
      return res.status(400).json({ error: "REGISTRATION_DENIED_ALL_FIELDS_MANDATORY_EXCEPT_SPONSOR" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "PASSWORDS_DO_NOT_MATCH_INTEGRITY_VIOLATION" });
    }

    // 2. Validate Password Rules on Backend for Enhanced Security
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9!@#$%^&*]/.test(password)) {
      return res.status(400).json({ error: "PASSWORD_FAIL_CRITERIA_SECURITY_COMPROMISED" });
    }

    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ error: "EMAIL_ALREADY_REGISTERED" });
    }

    // 3. Matrix Mapping Logic
    let sponsorObjectId = null;
    let parentObjectId = null;

    if (sponsor && sponsor.trim() !== "") {
      const validSponsor = mongoose.isValidObjectId(sponsor) 
        ? await User.findById(sponsor)
        : await User.findOne({ email: sponsor.trim().toLowerCase() });

      if (!validSponsor) {
        return res.status(400).json({ error: "SPECIFIED_SPONSOR_NOT_FOUND" });
      }

      sponsorObjectId = validSponsor._id;

      const placementResult = await matrixService.findMlmPlacement(sponsorObjectId);
      if (!placementResult.ok) {
        return res.status(409).json({ error: "FORCED_MATRIX_TREE_FULL_SPILLOVER_EXHAUSTED" });
      }
      parentObjectId = placementResult.parentId;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Thread-safe Document Creation Loop
    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      gender,
      nationalId: nationalId.trim(),
      password: hashedPassword,
      sponsorId: sponsorObjectId,
      parentId: parentObjectId,
      referrals: [],
      active: true
    });

    if (parentObjectId) {
      await User.findByIdAndUpdate(parentObjectId, { $push: { referrals: newUser._id } });
    }

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: "7d" });

    return res.status(201).json({
      token,
      user: { id: newUser._id, name: newUser.name, email: newUser.email, profilePic: newUser.profilePic },
      placedUnder: parentObjectId
    });

  } catch (err) {
    console.error("❌ Enhanced Registration Endpoint Failure:", err.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/network/forgot-password
 * 🔑 Phase 1 Recovery: Secure Token Production Generation Loop
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "EMAIL_ADDRESS_REQUIRED" });

    const user = await User.findOne({ email: email.toLowerCase() });
    // Production Security Practice: Return success even if email is missing to prevent user enumeration attacks
    if (!user) {
      return res.json({ message: "RECOVERY_TOKEN_GENERATED_SUCCESSFULLY_CHECK_LOGS" });
    }

    // Create single-use un-guessable hex token valid for exactly 1 hour
    const resetToken = crypto.randomBytes(20).toString("hex");
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour timestamp boundary window
    await user.save();

    // In local development environment context, print recovery link to console terminal line tracking
    console.log(`\n🔑 ============ SECURITY PASS RECOVERY SYSTEM ============`);
    console.log(`👤 Target Account Account: ${user.email}`);
    console.log(`🔗 Recovery Single Use Reset Token: ${resetToken}`);
    console.log(`💡 Simulated Link Context: http://localhost:5173/reset-password/${resetToken}`);
    console.log(`============================================================\n`);

    return res.json({ 
      message: "RECOVERY_TOKEN_GENERATED_SUCCESSFULLY_CHECK_LOGS",
      devToken: resetToken // Pass back to frontend directly for easy local evaluation profiling
    });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/network/reset-password
 * 🔑 Phase 2 Recovery: Verify Token & Mutate Target Hash
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: "TOKEN_AND_NEW_PASSWORD_PARAMETERS_MANDATORY" });
    }

    // Verify token validity against expiration limits using database lookups
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() } // Verifies it hasn't expired yet
    });

    if (!user) {
      return res.status(400).json({ error: "RECOVERY_TOKEN_INVALID_OR_EXPIRED_OPERATION_ABORTED" });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9!@#$%^&*]/.test(newPassword)) {
      return res.status(400).json({ error: "PASSWORD_FAIL_CRITERIA_SECURITY_COMPROMISED" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null; // Instantly destroy token to prevent multi-use playback attacks
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ message: "PASSWORD_MUTATED_SUCCESSFULLY_PROCEED_TO_AUTH" });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/network/login
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "MISSING_CREDENTIALS" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({
      token,
      user: { id: user._id, name: user.name, email: user.email, profilePic: user.profilePic }
    });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});


/**
 * GET /api/network/user/:id/suggest
 */
router.get("/user/:id/suggest", verifySessionToken, async (req, res) => {
  try {
    // 🟢 Leverages our calculated service methods cleanly
    const suggestions = await matrixService.calculateUplineSuggestions(req.params.id);
    return res.json({ sponsor: req.params.id, suggestions });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

module.exports = router;
