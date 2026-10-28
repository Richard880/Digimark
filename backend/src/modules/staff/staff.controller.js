const mongoose = require("mongoose");
const Staff = require("../../models/Staff");
const Branch = require("../../models/Branch");
const { entitlementsFor } = require("../membership/entitlements");
const { getOrCreatePrimaryBranch } = require("../../services/branchService");

function requireSeller(req, res) {
  if (!req.user?._id) {
    res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    return false;
  }
  if (req.userCategory !== "network") {
    res.status(403).json({ error: "MARKETER_ACCOUNT_REQUIRED" });
    return false;
  }
  return true;
}

// GET /api/staff
async function listStaff(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const staff = await Staff.find({ sellerId: req.user._id, isActive: true })
      .select("-pin")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, staff });
  } catch (err) {
    console.error("listStaff:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// POST /api/staff
async function createStaff(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const ent = entitlementsFor(req.user);

    // Phase 1 & 2 have staff limit = 0
    if (ent.limits.staff <= 0) {
      return res.status(403).json({
        error: "PLAN_UPGRADE_REQUIRED",
        feature: "staff",
        message: "Staff accounts are available from Smart-Hub (Phase 3) onwards.",
      });
    }

    const currentCount = await Staff.countDocuments({
      sellerId: req.user._id,
      isActive: true,
    });

    if (currentCount >= ent.limits.staff) {
      return res.status(403).json({
        error: "STAFF_LIMIT_REACHED",
        max: ent.limits.staff,
        current: currentCount,
      });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    const role = ["cashier", "manager", "inventory", "admin"].includes(req.body?.role)
      ? req.body.role
      : "cashier";

    const phone = typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 20) : "";

    // Optional: assign to specific branches
    let branchIds = [];
    if (Array.isArray(req.body?.branchIds)) {
      const validIds = req.body.branchIds.filter((id) => mongoose.isValidObjectId(id));
      if (validIds.length) {
        const owned = await Branch.find({
          _id: { $in: validIds },
          sellerId: req.user._id,
          isActive: true,
        }).select("_id");
        branchIds = owned.map((b) => b._id);
      }
    }

    // If no branches provided, assign to primary branch
    if (branchIds.length === 0) {
      const primary = await getOrCreatePrimaryBranch(req.user._id);
      branchIds = [primary._id];
    }

    const staff = await Staff.create({
      sellerId: req.user._id,
      name,
      phone,
      role,
      branchIds,
    });

    const safe = staff.toObject();
    delete safe.pin;

    return res.status(201).json({ ok: true, staff: safe });
  } catch (err) {
    console.error("createStaff:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// PATCH /api/staff/:id
async function updateStaff(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const updates = {};

    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (name.length < 2 || name.length > 80) {
        return res.status(400).json({ error: "INVALID_NAME" });
      }
      updates.name = name;
    }

    if (typeof req.body?.phone === "string") {
      updates.phone = req.body.phone.trim().slice(0, 20);
    }

    if (["cashier", "manager", "inventory", "admin"].includes(req.body?.role)) {
      updates.role = req.body.role;
    }

    if (Array.isArray(req.body?.branchIds)) {
      const validIds = req.body.branchIds.filter((id) => mongoose.isValidObjectId(id));
      const owned = await Branch.find({
        _id: { $in: validIds },
        sellerId: req.user._id,
        isActive: true,
      }).select("_id");
      updates.branchIds = owned.map((b) => b._id);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "NOTHING_TO_UPDATE" });
    }

    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id, isActive: true },
      { $set: updates },
      { new: true }
    ).select("-pin");

    if (!staff) return res.status(404).json({ error: "STAFF_NOT_FOUND" });

    return res.json({ ok: true, staff });
  } catch (err) {
    console.error("updateStaff:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// DELETE /api/staff/:id  (soft delete)
async function deactivateStaff(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const staff = await Staff.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!staff) return res.status(404).json({ error: "STAFF_NOT_FOUND" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("deactivateStaff:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = {
  listStaff,
  createStaff,
  updateStaff,
  deactivateStaff,
};
