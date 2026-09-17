const express = require("express");
const authenticate = require("../../middleware/authenticate");
const UserProfile = require("../../models/UserProfile");
const matrixService = require("../../services/matrixService"); // 🎯 NEW: Brought in for dashboard metric query execution
const { syncCurrentUser } = require("./auth.controller");

const router = express.Router();

/**
 * GET /api/auth/me
 * Retrieves the profile data alongside analytical matrix tree positions if they belong to a network affiliate account
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    const profile = await UserProfile.findOne({ userId: req.user._id }).lean();
    
    // Initialise response structure package
    const responsePayload = {
      user: req.user,
      profile: profile || null,
      matrixMetrics: null
    };

    // 🎯 SECURITY HOLE CHECK: Only compute deep tree metrics if the user track category is explicitly a network member
    if (req.userCategory === "network") {
      const metricsResult = await matrixService.getMatrixMetrics(req.user._id);
      if (metricsResult.ok) {
        responsePayload.matrixMetrics = metricsResult;
      }
    }

    res.json(responsePayload);
  } catch (error) {
    console.error("❌ Profile Retrieval Route Failure:", error.message);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
});

/**
 * POST /api/auth/sync
 * 🔒 Synchronization entry gateway for onboarding new users across both tracks
 */
router.post("/sync", authenticate, syncCurrentUser);

module.exports = router;
