const mongoose = require("mongoose");
const User = require("../models/User");
const ShopMember = require("../models/ShopMember");
const Branch = require("../models/Branch");

const PERMS = {
  owner: ["*"],
  manager: ["sell", "sales.all", "void", "price.override", "reports", "close", "customers.read", "customers.write", "customers.pay", "stock.view", "stock.adjust", "transfer", "terminals"],
  cashier: ["sell", "customers.read", "customers.pay"],
  stock_clerk: ["stock.view", "stock.adjust", "transfer"],
};
const E = (message, http = 400, extra) => Object.assign(new Error(message), { http, extra });
const isId = (v) => typeof v === "string" && mongoose.isValidObjectId(v);
const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function mainBranch(ownerId) {
  let b = await Branch.findOne({ ownerId, isMain: true }).select("name").lean();
  if (!b) {
    try { b = (await Branch.create({ ownerId, name: "Main", isMain: true })).toObject(); }
    catch (e) { if (e.code !== 11000) throw e; b = await Branch.findOne({ ownerId, isMain: true }).lean(); }
  }
  return b;
}

async function shop(req, res, next) {
  try {
    const u = req.user;
    if (!u) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    let owner = u, role = "owner", member = null, branchIds = null;
    if (u.accountCategory !== "network") {
      member = await ShopMember.findOne({ userId: u._id, status: "active" }).lean();
      if (!member) return res.status(403).json({ error: "NO_SHOP_ACCESS" });
      owner = await User.findById(member.ownerId).select("accountCategory membershipStatus membershipExpiresAt plan isActive").lean();
      if (!owner || owner.accountCategory !== "network" || !owner.isActive || owner.membershipStatus === "suspended") return res.status(403).json({ error: "NO_SHOP_ACCESS" });
      role = member.role;
      branchIds = role === "manager" && !member.branchIds.length ? null : member.branchIds.map(String);
    }
    const main = await mainBranch(owner._id);
    req.shop = { ownerId: owner._id, owner, role, memberId: member?._id || null, branchIds, mainBranchId: String(main._id),
      perms: PERMS[role] || [], memberName: member?.displayName || "Owner" };
    next();
  } catch (e) { console.error("❌ shop:", e.stack || e.message); res.status(500).json({ error: "INTERNAL_SERVER_ERROR" }); }
}

const has = (req, perm) => req.shop.perms.includes("*") || req.shop.perms.includes(perm);
const can = (perm) => (req, res, next) => (has(req, perm) ? next() : res.status(403).json({ error: "FORBIDDEN_ROLE" }));

// The branch this request works on: must belong to this shop and be one the person may use
async function resolveBranch(req, raw) {
  const { ownerId, branchIds, mainBranchId } = req.shop;
  const id = raw || (branchIds ? branchIds[0] : mainBranchId);
  if (!id || !isId(String(id))) throw E("INVALID_BRANCH");
  if (branchIds && !branchIds.includes(String(id))) throw E("BRANCH_FORBIDDEN", 403);
  const b = await Branch.findOne({ _id: id, ownerId, archived: false }).lean();
  if (!b) throw E("BRANCH_NOT_FOUND", 404);
  return b;
}

// A Mongo condition for reports and lists (aggregations don't cast strings, so ids are converted)
function branchScope(req, raw) {
  const allowed = req.shop.branchIds;
  if (raw && raw !== "all") {
    if (!isId(String(raw))) throw E("INVALID_BRANCH");
    if (allowed && !allowed.includes(String(raw))) throw E("BRANCH_FORBIDDEN", 403);
    return { branchId: oid(raw) };
  }
  return allowed ? { branchId: { $in: allowed.map(oid) } } : {};
}

module.exports = { shop, can, has, resolveBranch, branchScope, mainBranch, E, PERMS };
