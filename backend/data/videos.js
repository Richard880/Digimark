const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "videos.json");

// --- INITIALIZATION ---
// Ensure the database file exists on startup to prevent read errors
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2), "utf8");
}

/**
 * Reads the database from the JSON file
 * @returns {Array} List of video objects
 */
function read() {
  try {
    const content = fs.readFileSync(DB_PATH, "utf8");
    return JSON.parse(content || "[]");
  } catch (error) {
    console.error("❌ DB Read Error:", error.message);
    return [];
  }
}

/**
 * Writes data to the JSON file safely
 * @param {Array} data
 */
function write(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("❌ DB Write Error:", error.message);
  }
}

// --- EXPORTED METHODS ---

/**
 * Creates a new video record linked to a user
 */
exports.create = (videoData) => {
  const data = read();

  const newVideo = {
    id: "vid_" + crypto.randomBytes(6).toString("hex"),
    userId: videoData.userId || "anonymous", // Link to your MLM User ID
    title: videoData.title || "Untitled Video",
    status: "PROCESSING",
    tags: videoData.tags || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...videoData, // Merge any extra fields
  };

  data.push(newVideo);
  write(data);
  return newVideo;
};

/**
 * Updates status and metadata for a specific video
 */
exports.updateStatus = (id, status, updates = {}) => {
  const data = read();
  const index = data.findIndex((v) => v.id === id);

  if (index === -1) return null;

  // Merge existing data with new updates
  data[index] = {
    ...data[index],
    status: status,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  write(data);
  return data[index];
};

/**
 * Get all videos in the system
 */
exports.getAll = () => read();

/**
 * Get a specific video by its ID
 */
exports.getById = (id) => read().find((v) => v.id === id);

/**
 * NEW: Get all videos uploaded by a specific MLM User
 * Use this for the "My Videos" dashboard
 */
exports.getByUserId = (userId) => {
  return read().filter((v) => v.userId === userId);
};

/**
 * Deletes a video record
 */
exports.delete = (id) => {
  const data = read();
  const filtered = data.filter((v) => v.id !== id);
  write(filtered);
  return true;
};
