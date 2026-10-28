const mongoose = require("mongoose");
const Terminal = require("../../models/Terminal");
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

// GET /api/terminals
async function listTerminals(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const terminals = await Terminal.find({ sellerId: req.user._id, isActive: true })
      .populate("branchId", "name isPrimary")
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ ok: true, terminals });
  } catch (err) {
    console.error("listTerminals:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// POST /api/terminals
async function createTerminal(req, res) {
  try {
    if (!requireSeller(req, res)) return;

    const ent = entitlementsFor(req.user);

    const currentCount = await Terminal.countDocuments({
      sellerId: req.user._id,
      isActive: true,
    });

    if (currentCount >= ent.limits.terminals) {
      return res.status(403).json({
        error: "TERMINAL_LIMIT_REACHED",
        max: ent.limits.terminals,
        current: currentCount,
        message: `Your plan allows a maximum of ${ent.limits.terminals} POS terminal${ent.limits.terminals === 1 ? "" : "s"}.`,
      });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length < 2 || name.length > 60) {
      return res.status(400).json({ error: "INVALID_NAME" });
    }

    // Code (e.g. T01, COUNTER-1)
    let code = typeof req.body?.code === "string" ? req.body.code.trim().toUpperCase() : "";
    if (!code) {
      // Auto-generate a simple code
      code = `T${String(currentCount + 1).padStart(2, "0")}`;
    }
    if (code.length > 10) {
      return res.status(400).json({ error: "INVALID_CODE" });
    }

    // Branch assignment
    let branchId = req.body?.branchId;
    if (branchId) {
      if (!mongoose.isValidObjectId(branchId)) {
        return res.status(400).json({ error: "INVALID_BRANCH_ID" });
      }
      const owned = await Branch.exists({
        _id: branchId,
        sellerId: req.user._id,
        isActive: true,
      });
      if (!owned) {
        return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
      }
    } else {
      // Default to primary branch
      const primary = await getOrCreatePrimaryBranch(req.user._id);
      branchId = primary._id;
    }

    try {
      const terminal = await Terminal.create({
        sellerId: req.user._id,
        branchId,
        name,
        code,
        deviceId: typeof req.body?.deviceId === "string" ? req.body.deviceId.slice(0, 120) : null,
      });

      return res.status(201).json({ ok: true, terminal });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: "TERMINAL_CODE_EXISTS" });
      }
      throw err;
    }
  } catch (err) {
    console.error("createTerminal:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// PATCH /api/terminals/:id
async function updateTerminal(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const updates = {};

    if (typeof req.body?.name === "string") {
      const name = req.body.name.trim();
      if (name.length < 2 || name.length > 60) {
        return res.status(400).json({ error: "INVALID_NAME" });
      }
      updates.name = name;
    }

    if (typeof req.body?.code === "string") {
      const code = req.body.code.trim().toUpperCase();
      if (!code || code.length > 10) {
        return res.status(400).json({ error: "INVALID_CODE" });
      }
      updates.code = code;
    }

    if (req.body?.branchId) {
      if (!mongoose.isValidObjectId(req.body.branchId)) {
        return res.status(400).json({ error: "INVALID_BRANCH_ID" });
      }
      const owned = await Branch.exists({
        _id: req.body.branchId,
        sellerId: req.user._id,
        isActive: true,
      });
      if (!owned) {
        return res.status(404).json({ error: "BRANCH_NOT_FOUND" });
      }
      updates.branchId = req.body.branchId;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "NOTHING_TO_UPDATE" });
    }

    try {
      const terminal = await Terminal.findOneAndUpdate(
        { _id: req.params.id, sellerId: req.user._id, isActive: true },
        { $set: updates },
        { new: true }
      ).populate("branchId", "name isPrimary");

      if (!terminal) return res.status(404).json({ error: "TERMINAL_NOT_FOUND" });

      return res.json({ ok: true, terminal });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ error: "TERMINAL_CODE_EXISTS" });
      }
      throw err;
    }
  } catch (err) {
    console.error("updateTerminal:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// DELETE /api/terminals/:id  (soft delete)
async function deactivateTerminal(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const terminal = await Terminal.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id, isActive: true },
      { $set: { isActive: false } },
      { new: true }
    );

    if (!terminal) return res.status(404).json({ error: "TERMINAL_NOT_FOUND" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("deactivateTerminal:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

// Optional: heartbeat / last seen
// POST /api/terminals/:id/ping
async function pingTerminal(req, res) {
  try {
    if (!requireSeller(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "INVALID_ID" });
    }

    const terminal = await Terminal.findOneAndUpdate(
      { _id: req.params.id, sellerId: req.user._id, isActive: true },
      { $set: { lastSeenAt: new Date(), deviceId: req.body?.deviceId || undefined } },
      { new: true }
    );

    if (!terminal) return res.status(404).json({ error: "TERMINAL_NOT_FOUND" });

    return res.json({ ok: true });
  } catch (err) {
    console.error("pingTerminal:", err);
    return res.status(500).json({ error: "INTERNAL_SERVER_ERROR" });
  }
}

module.exports = {
  listTerminals,
  createTerminal,
  updateTerminal,
  deactivateTerminal,
  pingTerminal,
};
