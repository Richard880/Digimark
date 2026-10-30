import { useCallback, useEffect, useState } from "react";
import apiClient from "../services/apiClient";
import useAuth from "../features/auth/hooks/useAuth";
import { outboxAll, outboxPut, outboxDelete } from "./db";

const EVT = "sokodigi-outbox";
let running = false; // one sync at a time, across every component

const wire = (s) => ({ clientRef: s.clientRef, soldAt: s.soldAt, lines: s.lines, discount: s.discount, paymentMethod: s.paymentMethod,
  creditAmount: s.creditAmount, customerId: s.customerId, amountTendered: s.amountTendered, mpesaRef: s.mpesaRef, customerName: s.customerName });
const bySoldAt = (a, b) => (a.soldAt < b.soldAt ? -1 : 1);

export const provisionalReceipt = (s) => ({
  receiptNo: `L-${String(s.localNo).padStart(4, "0")}`, createdAt: s.soldAt, provisional: true,
  lines: s.display.lines, discount: s.discount || 0, total: s.total, paymentMethod: s.paymentMethod, amountTendered: s.amountTendered,
  change: s.change, mpesaRef: s.mpesaRef || "", customerName: s.display.customerName || "", creditAmount: s.localCredit || 0,
});

export default function useOutbox(userId, autoSync = false) {
  const [items, setItems] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    if (!userId) return;
    try { setItems((await outboxAll(userId)).sort(bySoldAt)); } catch { setItems([]); }
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId || running || !navigator.onLine) return;
    running = true; setSyncing(true); setBlocked("");
    let flagged = false;
    try {
      const todo = (await outboxAll(userId)).filter((s) => !s.error || s.retry).sort(bySoldAt);
      for (let i = 0; i < todo.length; i += 20) {
        const batch = todo.slice(i, i + 20);
        let data;
        try { ({ data } = await apiClient.post("/pos/sales/sync", { sales: batch.map(wire) })); }
        catch (e) {
          if (e.response?.status === 403) setBlocked("Renew your membership to send your saved sales. They are safe on this device.");
          break; // offline or the server is down: try again later
        }
        for (const r of data.results || []) {
          const item = batch.find((b) => b.clientRef === r.clientRef);
          if (!item) continue;
          if (r.ok) { await outboxDelete(item.clientRef); if (r.shortfall || r.overLimit) flagged = true; }
          else await outboxPut({ ...item, error: r.error, retry: !!r.retry, product: r.product || "" });
        }
      }
    } catch (e) { console.error("Sync failed:", e?.message); }
    finally {
      running = false; setSyncing(false);
      if (flagged) setNotice("Some saved sales were recorded after the stock had already run out, or went over a customer's credit limit. Check your inventory and customer balances.");
      window.dispatchEvent(new Event(EVT));
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    window.addEventListener(EVT, refresh);
    return () => window.removeEventListener(EVT, refresh);
  }, [refresh]);

  useEffect(() => {
    if (!autoSync || !userId) return undefined;
    Promise.resolve(navigator.storage?.persist?.()).catch(() => {}); // ask the browser not to evict saved sales
    sync();
    const onVis = () => document.visibilityState === "visible" && sync();
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(sync, 60000);
    return () => { window.removeEventListener("online", sync); document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [autoSync, userId, sync]);

  const queueSale = useCallback(async (item) => { await outboxPut(item); window.dispatchEvent(new Event(EVT)); sync(); }, [sync]);
  const retry = useCallback(async (item) => { await outboxPut({ ...item, error: "", retry: false }); sync(); }, [sync]);
  const discard = useCallback(async (item) => { await outboxDelete(item.clientRef); window.dispatchEvent(new Event(EVT)); }, []);

  return {
    items, syncing, blocked, notice, clearNotice: () => setNotice(""),
    waiting: items.filter((s) => !s.error || s.retry), problems: items.filter((s) => s.error && !s.retry),
    queueSale, sync, retry, discard,
  };
}

// Keeps syncing in the background anywhere in the app (render it once in MainLayout)
// 💡 Move this block ABOVE your "export default function useOutbox" definition or keep it here:
export function OutboxSync() {
  const { auth } = useAuth();
  // Safe string evaluation check
  const userId = auth.destination === "dashboard" && auth.user?._id ? String(auth.user._id) : "";
  useOutbox(userId, true);
  return null;
}

