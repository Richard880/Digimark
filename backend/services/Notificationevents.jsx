/**
 * EVENT CATALOG — the single list of everything the app can notify about.
 * To cover a new activity: add one entry here, then call notify("YOUR_TYPE", recipientId, ctx).
 *
 * ctx fields used below: orderId, orderRef, amount, buyerName, supplierName,
 * productId, productName, senderName, conversationId, reason, memberName, teamName, role, device
 */
const money = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const order = (c) => `/orders/${c.orderId}`;

// E(category, title, message(ctx), url(ctx))
const E = (category, title, message, url = order) => ({
  category,
  build: (c) => ({ title, message: message(c), actionUrl: url(c) }),
});

const EVENTS = {
  // ───────── Payments & escrow ─────────
  MPESA_STK_SENT:       E("ESCROW", "M-PESA prompt sent", (c) => `Enter your PIN to pay ${money(c.amount)} for order #${c.orderRef}.`),
  MPESA_PAYMENT_SUCCESS:E("ESCROW", "Payment received", (c) => `${money(c.amount)} received for order #${c.orderRef}.`),
  MPESA_PAYMENT_FAILED: E("ESCROW", "Payment failed", (c) => `Your M-PESA payment for order #${c.orderRef} didn't go through.${c.reason ? " " + c.reason : ""}`),
  ESCROW_FUNDED:        E("ESCROW", "Funds secured in escrow", (c) => `${money(c.amount)} for order #${c.orderRef} is held safely. You can ship now.`),
  ESCROW_RELEASED:      E("ESCROW", "Escrow released", (c) => `${money(c.amount)} for order #${c.orderRef} has been released.`),
  ESCROW_REFUNDED:      E("ESCROW", "Refund issued", (c) => `${money(c.amount)} for order #${c.orderRef} is being refunded to M-PESA.`),
  PAYOUT_SENT:          E("ESCROW", "Payout sent", (c) => `${money(c.amount)} was sent to your M-PESA.`, () => "/wallet"),
  PAYOUT_FAILED:        E("ESCROW", "Payout failed", (c) => `We couldn't send ${money(c.amount)} to your M-PESA. We'll retry shortly.`, () => "/wallet"),
  DISPUTE_OPENED:       E("ESCROW", "Dispute opened", (c) => `A dispute was opened on order #${c.orderRef}.${c.reason ? " Reason: " + c.reason : ""}`),
  DISPUTE_RESOLVED:     E("ESCROW", "Dispute resolved", (c) => `The dispute on order #${c.orderRef} has been resolved.`),

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
