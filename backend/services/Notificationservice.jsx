/*
 * Notification service. Lives in its own module (NOT server.js) so controllers can
 * require it without re-running server startup or hitting a circular import.
 */

const Notification = require("../src/models/Notification");
const { EVENTS } = require("./notificationEvents");

let io = null;
const init = (ioInstance) => { io = ioInstance; };
const roomFor = (userId) => `user:${userId}`;

/**
 * notify("ESCROW_FUNDED", supplierId, { orderId, orderRef, amount }, { actorId })
 *
 * - recipients: one id or an array of ids
 * - never throws, so a notification problem can't break a payment or order flow
 * - skips the actor by default (you don't need an alert for your own action)
 */
async function notify(type, recipients, ctx = {}, { actorId, includeActor = false } = {}) {
  try {
    const def = EVENTS[type];
    if (!def) {
      console.warn(`[Notifications] Unknown event type "${type}" — add it to notificationEvents.js`);
      return [];
    }

    const ids = [...new Set([].concat(recipients).filter(Boolean).map(String))]
      .filter((id) => includeActor || !actorId || id !== String(actorId));
    if (!ids.length) return [];

    const content = def.build(ctx);
    const docs = await Notification.insertMany(
      ids.map((recipientId) => ({
        recipientId,
        actorId,
        type,
        category: def.category,
        ...content,
        metadata: ctx,
      }))
    );

    if (io) {
      for (const doc of docs) io.to(roomFor(doc.recipientId)).emit("incoming-notification", doc);
    }
    return docs;
  } catch (err) {
    console.error(`❌ [Notifications] Failed to dispatch ${type}:`, err);
    return [];
  }
}

module.exports = { init, notify, roomFor };
