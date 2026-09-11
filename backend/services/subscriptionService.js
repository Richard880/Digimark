// services/subscriptionService.js
const wallets = require("../data/wallets");

class SubscriptionService {
  /**
   * Checks if a user is "Premium" based on their wallet balance.
   * This matches the logic in your verifyStreamSegment middleware.
   */
  async checkUserActive(userId) {
    if (!userId) return false;

    try {
      const wallet = wallets.getWallet(userId);
      // Returns true if wallet exists and has an active float
      return !!(wallet && wallets.hasActiveFloat(wallet));
    } catch (err) {
      console.error("Subscription check error:", err);
      return false;
    }
  }
}

module.exports = new SubscriptionService();
