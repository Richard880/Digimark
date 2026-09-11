// data/mlm.js
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB = path.join(__dirname, "mlm_users.json");

// Helper to ensure the JSON file exists
if (!fs.existsSync(DB)) {
  fs.writeFileSync(DB, JSON.stringify([], null, 2));
}

function read() {
  try {
    const content = fs.readFileSync(DB, "utf8");
    return JSON.parse(content || "[]");
  } catch (err) {
    console.error("Error reading MLM Database:", err);
    return [];
  }
}

function write(data) {
  try {
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error writing to MLM Database:", err);
  }
}

/**
 * Finds a user by email (Crucial for Login and Duplicate checks)
 */
exports.getByEmail = (email) => {
  if (!email) return null;
  return read().find((u) => u.email.toLowerCase() === email.toLowerCase());
};

/**
 * Updated createUser to handle the new Sign Up fields
 */
exports.createUser = (userData) => {
  const data = read();
  const id = "u_" + crypto.randomBytes(6).toString("hex");

  const newUser = {
    id,
    name: userData.name || "User",
    email: userData.email,
    password: userData.password, // Hashed password from API
    phone: userData.phone || null,
    gender: userData.gender || null,
    nationalId: userData.nationalId || null,
    sponsorId: userData.sponsorId || null,
    parentId: userData.parentId || null, // Tree placement parent
    referrals: [],

    active: true, // Defaulting to true for immediate login
    createdAt: new Date().toISOString(),
  };

  data.push(newUser);
  write(data);
  return newUser;
};

exports.getAll = () => read();

exports.getById = (id) => read().find((u) => u.id === id);

exports.update = (id, updates) => {
  const data = read();
  const index = data.findIndex((x) => x.id === id);
  if (index === -1) return null;

  data[index] = { ...data[index], ...updates };
  write(data);
  return data[index];
};

exports.addReferral = (parentId, childId) => {
  const data = read();
  const parent = data.find((x) => x.id === parentId);
  if (!parent) return null;

  if (!parent.referrals) parent.referrals = [];
  if (!parent.referrals.includes(childId)) {
    parent.referrals.push(childId);
    write(data);
  }
  return parent;
};

exports.findByPredicate = (pred) => read().filter(pred);
