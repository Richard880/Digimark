const { Document } = require("flexsearch");
const fs = require("fs");
const path = require("path");

const VIDEOS_PATH = path.join(__dirname, "..", "data", "videos.json");
const USERS_PATH = path.join(__dirname, "..", "data", "mlm_users.json");

const index = new Document({
  document: {
    id: "id",
    // Indexing title/tags for videos, and name/id for users
    index: ["title", "tags", "name", "id"],
    // Store relevant info to return to the UI
    store: ["id", "title", "price", "tags", "name", "type"],
  },
  tokenize: "forward",
  optimize: true,
});

const Engine = {
  sync: () => {
    try {
      // 1. Load and Index Videos
      if (fs.existsSync(VIDEOS_PATH)) {
        const videoData = JSON.parse(fs.readFileSync(VIDEOS_PATH, "utf8"));
        videoData.forEach((video) => {
          index.add({
            ...video,
            type: "video", // Tagging the type for UI filtering
          });
        });
        console.log(`✅ Indexed ${videoData.length} videos.`);
      }

      // 2. Load and Index Users
      if (fs.existsSync(USERS_PATH)) {
        const userData = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
        userData.forEach((user) => {
          index.add({
            id: user.id,
            name: user.name,
            type: "user", // Tagging the type for UI filtering
          });
        });
        console.log(`✅ Indexed ${userData.length} users.`);
      }
    } catch (err) {
      console.error("❌ Error syncing engine:", err.message);
    }
  },

  search: (query, filterType = null) => {
    if (!query) return [];
    const results = index.search(query, { enrich: true, limit: 30 });
    if (results.length === 0) return [];

    const seen = new Set();
    const flattened = [];

    results.forEach((fieldResult) => {
      fieldResult.result.forEach((hit) => {
        if (!seen.has(hit.id)) {
          if (!filterType || hit.doc.type === filterType) {
            seen.add(hit.id);
            // Calculate basic relevance score: exact matches get priority
            const isExact =
              hit.doc.title?.toLowerCase() === query.toLowerCase() ||
              hit.doc.name?.toLowerCase() === query.toLowerCase();
            flattened.push({ ...hit.doc, _score: isExact ? 1 : 0 });
          }
        }
      });
    });

    // Sort: Exact matches first (_score: 1), then everything else
    return flattened.sort((a, b) => b._score - a._score);
  },

  // Add this new function
  add: (item, type = "user") => {
    try {
      index.add({
        ...item,
        type: type, // Ensures the UI knows if it's a 'user' or 'video'
      });
      console.log(`✨ Search Engine: Added new ${type} [${item.id}] to index.`);
    } catch (err) {
      console.error("❌ Error adding to index:", err.message);
    }
  },
};

Engine.sync();

module.exports = Engine;
