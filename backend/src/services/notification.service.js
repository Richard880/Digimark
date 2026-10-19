const Notification = require("../models/Notification");
const { EVENTS } = require("./notificationEvents");

let io = null;
const init = (ioInstance) => { io = ioInstance; };
const roomFor = (userId) => `user:${userId}`;

// Only these context fields are ever stored
const CTX_KEYS = ["orderId", "orderRef", "amount", "level", "days", "productId", "productName", "senderName", "conversationId"];
const pickContext = (ctx) =>
  Object.fromEntries(
    CTX_KEYS.filter((k) => ctx[k] !== undefined && ctx[k] !== null).map((k) => [k, typeof ctx[k] === "number" ? ctx[k] : String(ctx[k]).slice(0, 120)])
  );

/**
 * await notify("ESCROW_FUNDED", sellerId, { orderId, orderRef, amount }, { actorId })
 * Never throws, so a notification problem can't break a payment or an order.
 * On serverless hosts, await it BEFORE sending the response, or the work can be cut off.
 */
async function notify(type, recipients, ctx = {}, { actorId, includeActor = false } = {}) {
  try {
    const def = EVENTS[type];
    if (!def) {
      console.warn(`[Notifications] Unknown event "${type}": add it to notificationEvents.js`);
      return [];
    }
    const ids = [...new Set([].concat(recipients).filter(Boolean).map(String))].filter(
      (id) => includeActor || !actorId || id !== String(actorId)
    );
    if (!ids.length) return [];

    const content = def.build(ctx);
    const docs = await Notification.insertMany(
      ids.map((recipientId) => ({ recipientId, actorId: actorId || null, type, category: def.category, ...content, metadata: pickContext(ctx) }))
    );

    if (io) {
      for (const d of docs) {
        io.to(roomFor(d.recipientId)).emit("incoming-notification", {
          _id: d._id, type: d.type, category: d.category, title: d.title,
          message: d.message, actionUrl: d.actionUrl, isRead: false, createdAt: d.createdAt,
        });
      }
    }
    return docs;
  } catch (err) {
    console.error(`❌ [Notifications] ${type} failed:`, err.message);
    return [];
  }
}

module.exports = { init, notify, roomFor };
