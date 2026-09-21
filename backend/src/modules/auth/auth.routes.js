const express = require("express");
const authenticate = require("../../middleware/authenticate");

// REVERT TO THIS: Two levels back is the correct location relative to src/
const UserProfile = require("../../models/UserProfile.js");
const User = require("../../models/User");

const matrixService = require("../../../services/matrixService"); 
const { syncCurrentUser } = require("./auth.controller");

const router = express.Router();

/**
 * GET /api/auth/me
 * Retrieves the profile data alongside analytical matrix tree positions if they belong to a network affiliate account
 */
router.get("/me", authenticate, async (req, res) => {
  try {
    // THE CRASH SAFEGUARD: If middleware returned a null user doc, locate them via their verified Firebase Uid
    let dbUserId = req.user?._id;
    let currentCategory = req.userCategory || "retail";
    let activeUserDoc = req.user;

    if (!dbUserId && req.firebaseUser?.uid) {
      // Look up if the core user record was generated during background sync delays
      const lazyUser = await User.findOne({ firebaseUid: req.firebaseUser.uid }).lean();
      if (lazyUser) {
        dbUserId = lazyUser._id;
        currentCategory = lazyUser.accountCategory || "retail";
        activeUserDoc = lazyUser;
      }
    }

    // If they completely skip basic DB records, return a clean payload blueprint instead of crashing the server!
    if (!dbUserId) {
      return res.json({
        ok: true,
        user: null,
        profile: {
          firstName: "",
          lastName: "",
          displayName: req.firebaseUser?.name || "",
          profilePhoto: req.firebaseUser?.photoURL || "",
          accountCategory: "retail"
        },
        matrixMetrics: null
      });
    }

    const profile = await UserProfile.findOne({ userId: dbUserId }).lean();
    
    // 🎯 THE FIX: Stitch the true account category directly into your profile data structure payload package
    const stitchedProfile = profile 
      ? { ...profile, accountCategory: currentCategory } 
      : {
          firstName: "",
          lastName: "",
          displayName: req.firebaseUser?.name || "",
          brandName: "",
          phoneNumber: "",
          profilePhoto: "",
          accountCategory: currentCategory
        };

    // Initialise response structure package
    const responsePayload = {
      ok: true,
      user: activeUserDoc,
      profile: stitchedProfile, // 🎯 Passes the combined dataset carrying your true network/retail track flags
      matrixMetrics: null
    };

    // Only compute deep tree metrics if the user track category is explicitly a network member
    if (currentCategory === "network") {
      const metricsResult = await matrixService.getMatrixMetrics(dbUserId);
      if (metricsResult && metricsResult.ok) {
        responsePayload.matrixMetrics = metricsResult;
      }
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error("❌ Profile Retrieval Route Failure:", error.stack || error.message);
    return res.status(500).json({ 
      error: "INTERNAL_SERVER_ERROR",
      message: error.message 
    });
  }
});

/**
 * POST /api/auth/sync
 * 🔒 Synchronization entry gateway for onboarding new users across both tracks
 */
router.post("/sync", authenticate, syncCurrentUser);

module.exports = router;
