// api/network.routes.js
const express = require("express");
const crypto = require("crypto"); // Built-in Node utility to generate secure un-guessable hex tokens
const mongoose = require("mongoose");

// 🎯 THE FIX: Use our central Firebase-backed asymmetric validation check completed in Layer 3
const authenticate = require("../../src/middleware/authenticate"); 
const User = require("../../src/models/User");
const matrixService = require("../../services/matrixService"); 

const router = express.Router();

/**
 * GET /api/network/matrix-metrics
 * 📊 Returns structural matrix tree performance indices for the authenticated account
 */
router.get("/matrix-metrics", authenticate, async (req, res) => {
  try {
    // 🛡️ SECURITY CHECK: Protect the database layer from running matrix graph crawls for retail users
    if (req.userCategory !== "network") {
      return res.status(403).json({ error: "ACCESS_DENIED_NETWORK_CATEGORY_REQUIRED" });
    }

    const metricsResult = await matrixService.getMatrixMetrics(req.user._id);
    if (!metricsResult.ok) {
      return res.status(400).json({ error: metricsResult.error, reason: metricsResult.reason });
    }

    return res.json(metricsResult);
  } catch (err) {
    console.error("❌ Route Failure inside Matrix Metrics extraction loop:", err.message);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/network/register
 * 🔒 Strict Verification Completeness Engine for Custom Fallback Signups
 */
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, gender, nationalId, password, confirmPassword, sponsor, accountCategory } = req.body || {};

    // 🛑 1. STRICT ENFORCEMENT: All fundamental fields must be present
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

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9!@#\$%^&*]/.test(password)) {
      return res.status(400).json({ error: "PASSWORD_FAIL_CRITERIA_SECURITY_COMPROMISED" });
    }

    const emailExists = await User.findOne({ email: email.toLowerCase() });
    if (emailExists) {
      return res.status(409).json({ error: "EMAIL_ALREADY_REGISTERED" });
    }

    // 2. Establish User Track Allocation Parameters
    const trackCategory = accountCategory === "network" ? "network" : "retail";
    
    let sponsorObjectId = null;
    let parentObjectId = null;
    let pathFromRoot = [];

    // 🎯 DUAL-TRACK SYSTEM SEPARATION GATEWAY
    if (trackCategory === "network") {
      const companyRoot = await User.findOne({ email: "admin@sokodigi.com" });
      if (!companyRoot) {
        return res.status(500).json({ error: "SYSTEM_ROOT_ANCHOR_NOT_FOUND_REGISTRATION_HALTED" });
      }

      let chosenSponsorId = companyRoot._id;

      if (sponsor && sponsor.trim() !== "") {
        const validSponsor = mongoose.isValidObjectId(sponsor) 
          ? await User.findById(sponsor)
          : await User.findOne({ email: sponsor.trim().toLowerCase(), accountCategory: "network" });

        if (!validSponsor) {
          return res.status(400).json({ error: "SPECIFIED_SPONSOR_NOT_FOUND_OR_INELIGIBLE" });
        }
        chosenSponsorId = validSponsor._id;
      }

      sponsorObjectId = chosenSponsorId;

      // 3. Invoke BFS Auto-Placement Engine Loop to discover open leg vacancies
      const placementResult = await matrixService.findMlmPlacement(sponsorObjectId);
      if (!placementResult.ok) {
        return res.status(409).json({ error: "FORCED_MATRIX_TREE_FULL_SPILLOVER_EXHAUSTED" });
      }
      parentObjectId = placementResult.parentId;

      // Unroll parent's materialized lineage path to construct child trail
      const parentNode = await User.findById(parentObjectId).select("pathFromRoot").lean();
      if (parentNode) {
        pathFromRoot = [...(parentNode.pathFromRoot || []), parentObjectId];
      }
    }

    // 4. Document Creation Execution Path
    const newUser = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      gender,
      nationalId: nationalId.trim(),
      password, // Password hashing logic handled safely within standard database structures or pre-save states
      accountCategory: trackCategory,
      sponsorId: sponsorObjectId,
      parentId: parentObjectId,
      pathFromRoot,
      referrals: [],
      isActive: true
    });

    if (parentObjectId) {
      await User.findByIdAndUpdate(parentObjectId, { $push: { referrals: newUser._id } });
    }

    // For fallback direct route accounts, keep your response payload unified
    return res.status(201).json({
      ok: true,
      user: { id: newUser._id, name: newUser.name, email: newUser.email, accountCategory: newUser.accountCategory },
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
    if (!user) {
      return res.json({ message: "RECOVERY_TOKEN_GENERATED_SUCCESSFULLY_CHECK_LOGS" });
    }

    const resetToken = crypto.randomBytes(20).toString("hex");
    
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour window
    await user.save();

    console.log(`\n🔑 ============ SECURITY PASS RECOVERY SYSTEM ============`);
    console.log(`👤 Target Account Account: ${user.email}`);
    console.log(`🔗 Recovery Single Use Reset Token: ${resetToken}`);
    console.log(`============================================================\n`);

    return res.json({ 
      message: "RECOVERY_TOKEN_GENERATED_SUCCESSFULLY_CHECK_LOGS",
      devToken: process.env.NODE_ENV === "development" ? resetToken : undefined
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

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ error: "RECOVERY_TOKEN_INVALID_OR_EXPIRED_OPERATION_ABORTED" });
    }

    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9!@#\$%^&*]/.test(newPassword)) {
      return res.status(400).json({ error: "PASSWORD_FAIL_CRITERIA_SECURITY_COMPROMISED" });
    }

    user.password = newPassword; // Hashing hooks intercept mutations smoothly
    user.resetPasswordToken = null; 
    user.resetPasswordExpires = null;
    await user.save();

    return res.json({ message: "PASSWORD_MUTATED_SUCCESSFULLY_PROCEED_TO_AUTH" });
  } catch (err) {
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/network/login
 * 🔑 Fallback authentication handler for local database standalone accounts
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "MISSING_CREDENTIALS" });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "INVALID_CREDENTIALS" });
    }

    // Sign a 7-day fallback symmetric JWT session block payload
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: "7d" });
    
    return res.json({
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        accountCategory: user.accountCategory,
        profilePic: user.profilePic 
      }
    });
  } catch (err) {
    console.error("❌ Local Fallback Login Failure:", err.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});


/**
 * GET /api/network/user/:id/suggest
 * 🟢 Returns calculated ancestral upline placementSuggestions for matrix builders
 */
router.get("/user/:id/suggest", authenticate, async (req, res) => {
  try {
    // 🛡️ SECURITY GUARD: Block retail category customers from polling ancestral upline trees
    if (req.userCategory !== "network") {
      return res.status(403).json({ error: "ACCESS_DENIED_NETWORK_CATEGORY_REQUIRED" });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_TARGET_USER_OBJECT_ID" });
    }

    const targetUserId = new mongoose.Types.ObjectId(req.params.id);

    // Fetch ancestral lineage suggestions from our core placement engine (MAX_DIRECT/MAX_DEPTH bounded)
    const suggestions = await matrixService.calculateUplineSuggestions(targetUserId, 12);
    
    return res.json({ 
      sponsor: req.params.id, 
      suggestions 
    });
  } catch (err) {
    console.error("❌ Upline Placement Suggestion Calculation Failure:", err.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

module.exports = router;

