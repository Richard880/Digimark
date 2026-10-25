/**
 * EVENT CATALOG — the single list of everything the app can notify about.
 * To cover a new activity: add one entry here, then call notify("YOUR_TYPE", recipientId, ctx).
 *
 * ctx fields used below: orderId, orderRef, amount, buyerName, supplierName,
 * productId, productName, senderName, conversationId, reason, memberName, teamName, role, device
 */
const money = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const order = (c) => `/orders/${c.orderId}`;
const dashboard = () => "/dashboard";
const wallet = () => "/wallet";

// E(category, title, message(ctx), url(ctx))
const E = (category, title, message, url = order) => ({
  category,
  build: (c) => ({ title, message: message(c), actionUrl: url(c) }),
  dashboard: () => "/dashboard"
});

// 🟢 FIX: Correctly maps audience targets dynamically without using an undefined 'URL' object
const byAudience = (c) => (c.audience === "seller" ? "/dashboard" : `/orders/${c.orderId}`);

const EVENTS = {
  // ───────── Payments & escrow ─────────
  MPESA_STK_SENT:       E("ESCROW", "M-PESA prompt sent", (c) => `Enter your PIN to pay ${money(c.amount)} for order #${c.orderRef}.`),
  MPESA_PAYMENT_SUCCESS:E("ESCROW", "Payment received", (c) => `${money(c.amount)} received for order #${c.orderRef}.`),
  MPESA_PAYMENT_FAILED: E("ESCROW", "Payment failed", (c) => `Your M-PESA payment for order #${c.orderRef} didn't go through.${c.reason ? " " + c.reason : ""}`),
  ESCROW_FUNDED:        E("ESCROW", "Funds secured in escrow", (c) => `${money(c.amount)} for order #${c.orderRef} is held safely. You can ship now.`),
  ESCROW_RELEASED:      E("ESCROW", "Escrow released", (c) => `${money(c.amount)} for order #${c.orderRef} has been released.`),
  ESCROW_REFUNDED:      E("ESCROW", "Refund issued", (c) => `${money(c.amount)} for order #${c.orderRef} is being refunded to M-PESA.`),
  PAYOUT_SENT:          E("ESCROW", "Payout sent", (c) => `${money(c.amount)} was sent to your M-PESA.`, wallet),
  PAYOUT_FAILED:        E("ESCROW", "Payout failed", (c) => `We couldn't send ${money(c.amount)} to your M-PESA. We'll retry shortly.`, wallet),

  // ───────── Orders ─────────
  ORDER_PLACED:         E("ORDERS", "New order", (c) => `${c.buyerName || "A buyer"} placed order #${c.orderRef}.`),
  ORDER_ACCEPTED:       E("ORDERS", "Order accepted", (c) => `${c.supplierName || "The supplier"} accepted order #${c.orderRef}.`),
  ORDER_DECLINED:       E("ORDERS", "Order declined", (c) => `${c.supplierName || "The supplier"} declined order #${c.orderRef}.${c.reason ? " " + c.reason : ""}`),
  ORDER_SHIPPED:        E("ORDERS", "Order shipped", (c) => `Order #${c.orderRef} is on its way.`),
  ORDER_DELIVERED:      E("ORDERS", "Order delivered", (c) => `Order #${c.orderRef} was marked delivered. Confirm to release payment.`),
  DELIVERY_CONFIRMED:   E("ORDERS", "Delivery confirmed", (c) => `${c.buyerName || "The buyer"} confirmed delivery of order #${c.orderRef}.`),
  ORDER_CANCELLED:      E("ORDERS", "Order cancelled", (c) => `Order #${c.orderRef} was cancelled.${c.reason ? " " + c.reason : ""}`),

  // ───────── Messages ─────────
  NEW_MESSAGE:          E("MESSAGES", "New message", (c) => `${c.senderName || "Someone"} sent you a message.`, (c) => `/messages/${c.conversationId}`),

  // ───────── Timers ─────────
  // 🟢 FIX: Changed undefined 'URL.*' declarations to point directly to valid functional hooks
  SELLER_CONFIRM_REMINDER: E("ORDERS", "Confirm your order", (c) => `Order #${c.orderRef} is waiting. Confirm it within ${c.hours} hours, or it's cancelled automatically and the buyer is refunded.`, dashboard),
  ORDER_AUTO_CANCELLED_BUYER: E("ORDERS", "Order cancelled and refunded", (c) => `The seller didn't confirm order #${c.orderRef} in time. ${money(c.amount)} was refunded to your wallet.`, wallet),
  ORDER_AUTO_CANCELLED_SELLER: E("ORDERS", "Order cancelled", (c) => `Order #${c.orderRef} was cancelled because it wasn't confirmed in time. The buyer was refunded and the stock returned.`, dashboard),
  BUYER_DELIVERY_REMINDER: E("ORDERS", "Has your order arrived?", (c) => `Order #${c.orderRef} is on its way. When it arrives, give the seller your PIN. If something is wrong, report it within ${c.days} day${c.days === 1 ? "" : "s"}, or the payment is released to the seller automatically.`),
  SELLER_AUTORELEASE_NOTICE: E("ORDERS", "Payment releases soon", (c) => `Order #${c.orderRef} will be paid out automatically within a day unless the buyer reports a problem.`, dashboard),
  ORDER_AUTO_RELEASED_BUYER: E("ORDERS", "Order marked delivered", (c) => `No problem was reported on order #${c.orderRef} during the protection period, so the payment was released to the seller.`),

  // ───────── Disputes (Merged & Deduplicated) ─────────
  // 🟢 FIX: Unified duplicate entries into single descriptive blocks
  DISPUTE_OPENED: E("ESCROW", "A problem was reported", (c) => `A problem was reported on order #${c.orderRef}. The payment is on hold while Sokodigi reviews it. Add your side in the order.`, byAudience),
  DISPUTE_UPDATE: E("ESCROW", "New reply on a dispute", (c) => `There's a new message on the dispute for order #${c.orderRef}.`, byAudience),
  DISPUTE_WITHDRAWN: E("ESCROW", "Dispute withdrawn", (c) => `The dispute on order #${c.orderRef} was withdrawn and the order continues.`, byAudience),
  DISPUTE_RESOLVED: E("ESCROW", "Dispute resolved", (c) => c.outcome === "refund"
    ? `The dispute on order #${c.orderRef} was resolved in the buyer's favour. ${money(c.amount)} was refunded to the buyer.`
    : `The dispute on order #${c.orderRef} was resolved in the seller's favour. The payment was released to the seller.`, byAudience),
  
  ADMIN_ALERT: E("SYSTEM", "Needs attention", (c) => String(c.text || "").slice(0, 300), () => "/admin"),

  // ───────── Products, account, team ─────────
  PRODUCT_APPROVED:     E("SYSTEM", "Product approved", (c) => `${c.productName} is now live.`, (c) => `/products/${c.productId}`),
  PRODUCT_REJECTED:     E("SYSTEM", "Product rejected", (c) => `${c.productName} wasn't approved.${c.reason ? " " + c.reason : ""}`, (c) => `/products/${c.productId}/edit`),
  LOW_STOCK:            E("SYSTEM", "Low stock", (c) => `${c.productName} is running low.`, (c) => `/products/${c.productId}/edit`),
  NEW_REVIEW:           E("SYSTEM", "New review", (c) => `${c.buyerName || "A buyer"} reviewed ${c.productName}.`, (c) => `/products/${c.productId}`),
  VERIFICATION_APPROVED:E("SYSTEM", "Account verified", () => "Your business verification was approved.", () => "/settings"),
  VERIFICATION_REJECTED:E("SYSTEM", "Verification needs changes", (c) => `We couldn't verify your account.${c.reason ? " " + c.reason : ""}`, () => "/settings"),
  NEW_LOGIN:            E("SYSTEM", "New sign-in", (c) => `Your account was signed in${c.device ? " on " + c.device : ""}. Wasn't you? Change your password.`, () => "/settings/security"),
  PASSWORD_CHANGED:     E("SYSTEM", "Password changed", () => "Your password was changed.", () => "/settings/security"),
  TEAM_INVITE:          E("SYSTEM", "Team invitation", (c) => `You've been invited to join ${c.teamName}.`, () => "/team"),
  TEAM_MEMBER_JOINED:   E("SYSTEM", "New team member", (c) => `${c.memberName} joined ${c.teamName}.`, () => "/team"),
  TEAM_ROLE_CHANGED:    E("SYSTEM", "Role updated", (c) => `Your role in ${c.teamName} is now ${c.role}.`, () => "/team"),
};

module.exports = { EVENTS };
