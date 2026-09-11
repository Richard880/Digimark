const videosDb = require("../data/videos");
// const adVideosDb = require("../data/advideos");
const SubscriptionService = require("./subscriptionService");

const fs = require("fs");
const path = require("path");

// Paths to your JSON databases
const AD_DB_FILE = path.join(__dirname, "../data/advideos.json");

// 1. Core Similarity Math (Standalone functions)
function calculateCosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val ** 2, 0));
  const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val ** 2, 0));
  return magA && magB ? dotProduct / (magA * magB) : 0;
}

function getVector(itemTags, globalTags) {
  return globalTags.map((tag) => (itemTags.includes(tag) ? 1 : 0));
}

// 2. Main Feed Generator (Netflix/YouTube Hybrid)
async function generateFeed(userId, userHistory = []) {
  const isPremium = userId
    ? await SubscriptionService.checkUserActive(userId)
    : false;

  const allPaid = (videosDb.getAllReadyVideos() || []).map((v) => ({
    ...v,
    type: "paid",
  }));
  const allFree = (adVideosDb.getAllReadyVideos() || []).map((v) => ({
    ...v,
    type: "free",
  }));
  const allContent = [...allPaid, ...allFree];

  if (userHistory.length > 0) {
    const globalTags = [...new Set(allContent.flatMap((v) => v.tags || []))];
    const recentTags = userHistory.slice(-5).flatMap((v) => v.tags || []);
    const userProfileVector = getVector(recentTags, globalTags);

    allContent.forEach((item) => {
      const itemVector = getVector(item.tags || [], globalTags);
      const similarity = calculateCosineSimilarity(
        userProfileVector,
        itemVector,
      );
      const popularityScore = (item.views || 0) * 0.1;
      const recencyBonus = item.createdAt > Date.now() - 86400000 ? 0.5 : 0;
      item.rankScore = similarity + popularityScore + recencyBonus;
    });
    allContent.sort((a, b) => b.rankScore - a.rankScore);
  } else {
    allContent.sort((a, b) => (b.views || 0) - (a.views || 0));
  }

  return allContent.map((video) => ({
    ...video,
    stream_url:
      video.type === "paid" && !isPremium ? video.previewKey : video.storageKey,
    isGated: video.type === "paid" && !isPremium,
  }));
}

// 3. Related Content API (The "Up Next" sidebar)
function getRecommendations(videoId) {
  try {
    const allVideos = videosDb.getAll() || [];
    const targetVideo = allVideos.find((v) => v.id === videoId);
    const candidates = allVideos.filter(
      (v) => v.id !== videoId && v.status === "READY",
    );

    if (!targetVideo || !targetVideo.tags || targetVideo.tags.length === 0) {
      return candidates.slice(0, 10).map((v) => ({ ...v, score: 0 }));
    }

    const allTags = [...new Set(allVideos.flatMap((v) => v.tags || []))];
    const targetVector = getVector(targetVideo.tags, allTags);

    return candidates
      .map((v) => ({
        ...v,
        score: calculateCosineSimilarity(
          targetVector,
          getVector(v.tags || [], allTags),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  } catch (err) {
    console.error("🔥 Recommendation Engine Error:", err);
    return [];
  }
}
// Add this to your services/feedService.js

/**
 * TikTok-style Ad Feed Generator
 * Prioritizes READY status and adds a "Vibe" factor (randomness)
 * so the feed doesn't feel static.
 */
async function generateAdFeed() {
  try {
    // 1. Read raw JSON data
    if (!fs.existsSync(AD_DB_FILE)) return [];
    const allAds = JSON.parse(fs.readFileSync(AD_DB_FILE, "utf-8"));

    // 2. Filter and Map
    return allAds
      .filter((ad) => ad.status === "READY")
      .map((ad) => {
        // TikTok Logic: Trending (if you add views later) + Freshness
        const freshnessScore = new Date(ad.updatedAt).getTime() / 1000000;
        const randomVibe = Math.random() * 50;

        return {
          ...ad,
          title: ad.title || `Sokodigi Ad ${ad.id.slice(0, 4)}`,
          rankScore: freshnessScore + randomVibe,
          // Correct path based on your api/advideos.js storage logic
          stream_url: `http://localhost:3000/storage/public_videos/${ad.id}/index.m3u8`,
        };
      })
      .sort((a, b) => b.rankScore - a.rankScore); // Highest "vibe" first
  } catch (err) {
    console.error("🔥 Ad Feed Error:", err);
    return [];
  }
}

module.exports = {
  generateFeed,
  getRecommendations,
  generateAdFeed, // ✅ Export the new ad feed
};
