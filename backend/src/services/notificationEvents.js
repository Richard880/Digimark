const money = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;

// Links must point at real pages in the app
const URL = {
  orders: () => "/profile",
  wallet: () => "/wallet",
  messages: () => "/messages",
  membership: () => "/membership",
  team: () => "/my-team",
  product: (c) => `/product-details/${c.productId}`,
};

const E = (category, title, message, url = URL.orders) => ({
  category,
  build: (c) => ({ title, message: message(c), actionUrl: url(c) }),
});

const EVENTS = {
  // Payments and escrow
  MPESA_PAYMENT_SUCCESS: E("ESCROW", "Top-up received", (c) => `${money(c.amount)} was added to your wallet.`, URL.wallet),
  MPESA_PAYMENT_FAILED: E("ESCROW", "Top-up failed", (c) => `Your M-Pesa top-up of ${money(c.amount)} didn't go through.`, URL.wallet),
  ESCROW_FUNDED: E("ESCROW", "Payment secured in escrow", (c) => `${money(c.amount)} for order #${c.orderRef} is held safely. Deliver it, then ask the buyer for their PIN.`),
  ESCROW_RELEASED: E("ESCROW", "Payment released", (c) => `${money(c.amount)} for order #${c.orderRef} was added to your wallet.`, URL.wallet),
  ESCROW_REFUNDED: E("ESCROW", "Refund issued", (c) => `${money(c.amount)} for order #${c.orderRef} was refunded to your wallet.`, URL.wallet),
  PAYOUT_SENT: E("ESCROW", "Withdrawal sent", (c) => `${money(c.amount)} was sent to your M-Pesa.`, URL.wallet),
  PAYOUT_FAILED: E("ESCROW", "Withdrawal failed", (c) => `We couldn't send ${money(c.amount)} to your M-Pesa. It was returned to your wallet.`, URL.wallet),

  // Orders
  ORDER_PLACED: E("ORDERS", "New order", (c) => `Order #${c.orderRef} for ${money(c.amount)} was placed in your shop.`),
  ORDER_COMPLETED: E("ORDERS", "Order complete", (c) => `Order #${c.orderRef} was delivered. Thanks for shopping on Sokodigi.`),
  ORDER_CANCELLED: E("ORDERS", "Order cancelled", (c) => `Order #${c.orderRef} was cancelled.`),

  // Messages
  NEW_MESSAGE: E("MESSAGES", "New message", (c) => `${c.senderName || "Someone"} sent you a message.`, URL.messages),

  // Network and membership
  PROMOTER_BONUS: E("SYSTEM", "Promoter bonus earned", (c) => `You earned ${money(c.amount)} from order #${c.orderRef}.`, URL.wallet),
  NETWORK_COMMISSION: E("SYSTEM", "Network commission", (c) => `You earned ${money(c.amount)} from a level ${c.level} membership payment.`, URL.wallet),
  TEAM_MEMBER_JOINED: E("SYSTEM", "New team member", () => "A new member joined your network.", URL.team),
  MEMBERSHIP_ACTIVATED: E("SYSTEM", "Membership active", () => "Your shop is live. Welcome to Sokodigi.", URL.membership),
  MEMBERSHIP_EXPIRING: E("SYSTEM", "Membership ending soon", (c) => `Your membership ends in ${c.days} day${c.days === 1 ? "" : "s"}. Renew to keep selling and earning.`, URL.membership),
  MEMBERSHIP_EXPIRED: E("SYSTEM", "Membership expired", () => "Your membership has ended. Renew to reopen your shop.", URL.membership),
  LOW_STOCK: E("SYSTEM", "Low stock", (c) => `${c.productName} is running low.`, URL.product),
};

module.exports = { EVENTS };
