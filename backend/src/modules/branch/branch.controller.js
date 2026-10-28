const mongoose = require("mongoose");
const Branch = require("../models/Branch");
const { entitlementsFor } = require("../membership/entitlements");
const { getOrCreatePrimaryBranch } = require("../services/branchService");

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

// GET /api/branches
async function listBranches(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    // Ensure primary branch always exists
    await getOrCreatePrimaryBranch(req.user._id);

    const branches = await Branch.find({ sellerId: req.user._id, isActive: true })
      .sort({ isPrimary: -1, createdAt: 1 })
      .lean();

    return res.json({ ok: true, branches });
  } catch (err) {
    console.error("listBranches:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// POST /api/branches
async function createBranch(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const ent = entitlementsFor(req.user);
    const currentCount = await Branch.countDocuments({
      sellerId: req.user._id,
      isActive: true,
    });

    if (currentCount >= ent.limits.branches) {
      return res.status(403).json({
        error: "BRANCH_LIMIT_REACHED",
        max: ent.limits.branches,
        current: currentCount,
      });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    const branch = await Branch.create({
      sellerId: req.user._id,
      name,
      isPrimary: false,
      address: typeof req.body?.address === "string" ? req.body.address.trim().slice(0, 200) : "",
      phone: typeof req.body?.phone === "string" ? req.body.phone.trim().slice(0, 20) : "",
    });

    return res.status(201).json({ ok: true, branch });
  } catch (err) {
    console.error("createBranch:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// PATCH /api/branches/:id
async function updateBranch(req, res) {
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
    if (typeof req.body?.address === "string") {
      updates.address = req.body.address.trim().slice(0, 200);
    }
    if (typeof req.body?.phone === "string") {
      updates.phone = req.body.phone.trim().slice(0, 20);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "NOTHING_TO_UPDATE" });
    }

    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id, isActive: true },
      { $set: updates },
      { new: true }
    );

    if (!branch) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
    return res.json({ ok: true, branch });
  } catch (err) {
    console.error("updateBranch:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// POST /api/branches/:id/set-primary
async function setPrimary(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const target = await Branch.findOne({
        _id: req.params.id,
        sellerId: req.user._id,
        isActive: true,
      }).session(session);

      if (!target) {
        await session.abortTransaction();
        return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
      }

      // Unset current primary
      await Branch.updateMany(
        { sellerId: req.user._id, isPrimary: true },
        { $set: { isPrimary: false } },
        { session }
      );

      // Set new primary
      target.isPrimary = true;
      await target.save({ session });

      await session.commitTransaction();
      return res.json({ ok: true, branch: target });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error("setPrimary:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// DELETE /api/branches/:id  (soft delete)
async function deactivateBranch(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const branch = await Branch.findOne({
      _id: req.params.id,
      sellerId: req.user._id,
    });

    if (!branch) return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
    if (branch.isPrimary) {
      return res.status(409).json({ error: "CANNOT_DEACTIVATE_PRIMARY" });
    }

    branch.isActive = false;
    await branch.save();

    return res.json({ ok: true });
  } catch (err) {
    console.error("deactivateBranch:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = {
  listBranches,
  createBranch,
  updateBranch,
  setPrimary,
  deactivateBranch,
};
