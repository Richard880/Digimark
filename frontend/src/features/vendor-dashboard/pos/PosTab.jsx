import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import useShop from "../../shop/useShop";
import useTerminal from "../../../offline/useTerminal";.
import { usePWA } from "../../../pwa/usePWA";
import { sizedImage } from "../../../utils/image";
import { kvGet, kvSet, nextLocalNo } from "../../../offline/db";
import { provisionalReceipt } from "../../../offline/useOutbox";
import { ReceiptSheet } from "./Receipt";
import BarcodeScanner from "./BarcodeScanner";


const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const up = (n, s) => Math.ceil(n / s) * s;
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = {
  INSUFFICIENT_STOCK: "Not enough stock", PLAN_UPGRADE_REQUIRED: "Your plan doesn't include that, or your membership has expired.",
  INVALID_DISCOUNT: "The discount must be less than the total.", INSUFFICIENT_TENDER: "The cash given is less than the amount due.",
  INVALID_PRICE: "Check the prices.", INVALID_LINES: "Check the items and quantities.", INVALID_MPESA_REF: "The M-Pesa code is 10 letters and numbers.",
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.", PRODUCT_NOT_FOUND: "A product in this sale no longer exists.",
  CREDIT_LIMIT_EXCEEDED: "That would take the customer over their credit limit.", CUSTOMER_NOT_FOUND: "That customer was removed or archived.",
  CREDIT_CUSTOMER_REQUIRED: "Choose a customer for a credit sale.", INVALID_CREDIT: "Check the credit amount.", SERVER_ERROR: "The server had a problem. It will be tried again.",
  PRICE_OVERRIDE_FORBIDDEN,
  DISCOUNT_FORBIDDEN, 
  TERMINAL_REQUIRED, 
  TERMINAL_REVOKED, 
  BRANCH_FORBIDDEN,
  BRANCH_NOT_FOUND,
};

function OutboxPanel({ outbox, onReceipt }) {
  if (outbox.items.length === 0 && !outbox.blocked) return null;
  return (
    <div className="mb-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
      {outbox.waiting.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-bold">{outbox.waiting.length} sale{outbox.waiting.length === 1 ? "" : "s"} saved on this device, waiting to send.</p>
          <button type="button" onClick={outbox.sync} disabled={outbox.syncing || !navigator.onLine} className="min-h-9 rounded-xl bg-amber-600 px-3 font-bold text-white disabled:opacity-50">{outbox.syncing ? "Sending…" : "Send now"}</button>
        </div>
      )}
      {outbox.blocked && <p role="alert" className="font-bold">{outbox.blocked}</p>}
      {outbox.problems.map((s) => (
        <div key={s.clientRef} className="rounded-xl bg-white p-3">
          <p className="font-black text-slate-900">L-{String(s.localNo).padStart(4, "0")} · {fmt(s.total)}</p>
          <p className="text-red-700">{ERR[s.error] || "This sale couldn't be recorded."}{s.product ? ` (${s.product})` : ""}</p>
          <div className="mt-2 flex gap-3 font-bold">
            <button type="button" onClick={() => onReceipt(provisionalReceipt(s))} className="text-emerald-700 underline">Receipt</button>
            <button type="button" onClick={() => outbox.retry(s)} className="text-emerald-700 underline">Try again</button>
            <button type="button" onClick={() => window.confirm("Discard this sale? It will NOT be recorded and the stock won't change.") && outbox.discard(s)} className="text-red-600 underline">Discard</button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PosTab({ outbox }) {
  const { auth } = useAuth();
  const { online } = usePWA();
  const { ent } = useEntitlements();
  const uid = auth.user?._id ? String(auth.user._id) : "";
  const shop = { name: auth.profile?.brandName || "Sokodigi shop", place: auth.profile?.location?.county || "" };

  const [catalog, setCatalog] = useState([]);
  const [savedAt, setSavedAt] = useState(null);
  const [truncated, setTruncated] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [cachedCredit, setCachedCredit] = useState(false);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [custQ, setCustQ] = useState("");
  const [deposit, setDeposit] = useState("");
  const [depMethod, setDepMethod] = useState("cash");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const key = useRef(null);

  // with the other state:
const [scan, setScan] = useState(false);
const [scanMsg, setScanMsg] = useState(null);
const [cachedBarcodes, setCachedBarcodes] = useState(false);
const cartRef = useRef({});
cartRef.current = cart;
  

  const canCredit = ent ? !!(ent.active && ent.features.creditSales) : cachedCredit;
  useEffect(() => { if (uid) kvGet(`credit:${uid}`).then((v) => setCachedCredit(!!v)).catch(() => {}); }, [uid]);
  useEffect(() => { if (uid && ent) kvSet(`credit:${uid}`, !!(ent.active && ent.features.creditSales)).catch(() => {}); }, [uid, ent]);

  const canScan = ent ? !!(ent.active && ent.features.barcodes) : cachedBarcodes;
useEffect(() => { if (uid) kvGet(`barcodes:${uid}`).then((v) => setCachedBarcodes(!!v)).catch(() => {}); }, [uid]);
useEffect(() => { if (uid && ent) kvSet(`barcodes:${uid}`, !!(ent.active && ent.features.barcodes)).catch(() => {}); }, [uid, ent]);

  const loadCatalog = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/pos/catalog");
      setCatalog(data.products); setTruncated(data.truncated); setSavedAt(null); setError("");
      kvSet(`catalog:${uid}`, { products: data.products, at: Date.now() }).catch(() => {});
    } catch {
      const c = await kvGet(`catalog:${uid}`).catch(() => null);
      if (c) { setCatalog(c.products); setSavedAt(c.at); }
      else setError("Open the POS once while online so your products can be saved on this device.");
    } finally { setLoading(false); }
  }, [uid]);
  useEffect(() => { if (uid) loadCatalog(); }, [uid, loadCatalog, online, outbox.items.length === 0]);

  useEffect(() => {
    if (!uid || !canCredit) return;
    apiClient.get("/customers/lookup")
      .then(({ data }) => { setCustomers(data.customers); kvSet(`customers:${uid}`, data.customers).catch(() => {}); })
      .catch(async () => { const c = await kvGet(`customers:${uid}`).catch(() => null); if (c) setCustomers(c); });
  }, [uid, canCredit, online]);

  // Sales waiting to sync have already left the shelf and (for credit) already added to a customer's debt
  const pending = useMemo(() => {
    const stock = {}, credit = {};
    for (const s of outbox.items) {
      s.lines.forEach((l) => { stock[l.productId] = (stock[l.productId] || 0) + l.quantity; });
      if (s.customerId && s.localCredit) credit[s.customerId] = (credit[s.customerId] || 0) + s.localCredit;
    }
    return { stock, credit };
  }, [outbox.items]);
  const stockOf = (p) => Math.max(0, p.quantity - (pending.stock[p._id] || 0));

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? catalog.filter((p) => p.name.toLowerCase().includes(t) || String(p.productCode || "").toLowerCase().includes(t)) : catalog).slice(0, 60);
  }, [catalog, q]);

  const add = (p) => setCart((c) => { const qty = (c[p._id]?.qty || 0) + 1; return qty > stockOf(p) ? c : { ...c, [p._id]: { p, qty, price: c[p._id]?.price ?? String(p.price) } }; });
  const setQty = (id, n) => setCart((c) => {
    const cur = c[id]; if (!cur) return c;
    if (n <= 0) { const { [id]: _drop, ...rest } = c; return rest; }
    return { ...c, [id]: { ...cur, qty: Math.min(n, stockOf(cur.p)) } };
  });

  const onCode = (raw) => {
  const code = String(raw).trim();
  const p = catalog.find((x) => x.barcode && x.barcode === code);
  if (!p) return setScanMsg({ ok: false, t: `No product has the barcode ${code}. Attach it in the product's Edit screen.` });
  if ((cartRef.current[p._id]?.qty || 0) >= stockOf(p)) return setScanMsg({ ok: false, t: `${p.name}: no more stock.` });
  add(p);
  setScanMsg({ ok: true, t: `Added ${p.name}` });
};
  
  const setPrice = (id, v) => setCart((c) => ({ ...c, [id]: { ...c[id], price: v.replace(/\D/g, "").slice(0, 7) } }));

  const items = Object.values(cart);
  const count = items.reduce((t, l) => t + l.qty, 0);
  const subtotal = items.reduce((t, l) => t + l.qty * (Number(l.price) || 0), 0);
  const disc = /^\d{1,8}$/.test(discount) ? Number(discount) : 0;
  const total = subtotal - disc;
  const onCredit = method === "credit";
  const dep = onCredit && /^\d{1,8}$/.test(deposit) ? Number(deposit) : 0;
  const creditAmt = onCredit ? total - dep : 0;
  const due = onCredit ? dep : total;
  const paidMethod = onCredit ? (dep > 0 ? depMethod : null) : method;
  const given = tendered === "" ? due : Number(tendered);
  const change = given - due;
  const cust = customers.find((c) => c._id === customerId);
  const owed = cust ? cust.balance + (pending.credit[cust._id] || 0) : 0;
  const overLimit = !!cust && cust.creditLimit != null && owed + creditAmt > cust.creditLimit;
  const baseOk = items.length > 0 && total >= 1 && disc < subtotal && items.every((l) => Number(l.price) >= 1);
  const ready = baseOk && (!onCredit || (!!cust && dep < total && creditAmt >= 1 && !(overLimit && online)));
  const cashShort = paidMethod === "cash" && tendered !== "" && given < due;
  const quick = [...new Set([due, up(due, 100), up(due, 500), up(due, 1000)])].filter((n) => n >= due && n > 0).slice(0, 4);
  const custMatches = customers.filter((c) => !custQ.trim() || c.name.toLowerCase().includes(custQ.trim().toLowerCase()) || String(c.phone || "").includes(custQ.trim())).slice(0, 20);

  const reset = () => { setCart({}); setDiscount(""); setTendered(""); setMpesaRef(""); setCustomerName(""); setCustomerId(""); setCustQ(""); setDeposit(""); setSheet(false); setError(""); key.current = null; };

  const build = () => ({
    clientRef: key.current, soldAt: new Date().toISOString(),
    lines: items.map((l) => ({ productId: l.p._id, quantity: l.qty, unitPrice: Number(l.price) })),
    discount: disc,
    paymentMethod: onCredit ? (dep > 0 ? depMethod : "credit") : method,
    creditAmount: onCredit && dep > 0 ? creditAmt : undefined,
    customerId: onCredit ? customerId : undefined,
    amountTendered: paidMethod === "cash" ? given : undefined,
    mpesaRef: paidMethod === "mpesa" ? mpesaRef.trim().toUpperCase() || undefined : undefined,
    customerName: onCredit ? undefined : customerName.trim() || undefined,
  });

  const saveOffline = async (body) => {
    const no = await nextLocalNo(uid);
    const item = { ...body, userId: uid, localNo: no, total, change: paidMethod === "cash" ? change : undefined, localCredit: creditAmt,
      display: { lines: items.map((l) => ({ name: l.p.name, quantity: l.qty, unitPrice: Number(l.price) })), customerName: cust?.name || customerName.trim() } };
    await outbox.queueSale(item);
    return provisionalReceipt(item);
  };

  const charge = async () => {
    if (busy || !ready || cashShort) return;
    setBusy(true); setError("");
    if (!key.current) key.current = crypto.randomUUID().replace(/-/g, "");
    const body = build();
    try {
      if (!online) throw Object.assign(new Error("offline"), { noAnswer: true });
      const { data } = await apiClient.post("/pos/sales", body);
      key.current = null; setReceipt(data.sale); setSheet(false); loadCatalog();
    } catch (e) {
      if (!e.response) {
        // No answer from the server. Saving it is safe: the same clientRef can never be recorded twice.
        try { const r = await saveOffline(body); key.current = null; setReceipt(r); setSheet(false); }
        catch { setError("Couldn't save this sale on the device. Write it down and record it when you're back online."); }
      } else {
        key.current = null;
        const d = e.response.data;
        setError(d?.error === "INSUFFICIENT_STOCK" ? `Not enough stock for ${d.product}.` : ERR[d?.error] || "Something went wrong. Please try again.");
      }
    } finally { setBusy(false); }
  };

  const cartPanel = (
    <div className="space-y-3">
      {items.length === 0 ? <p className="py-8 text-center text-xs text-slate-400">Tap products to add them to the sale.</p> : (
        <ul className="divide-y divide-slate-100">
          {items.map((l) => (
            <li key={l.p._id} className="space-y-1.5 py-2.5">
              <div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{l.p.name}</p>
                <button type="button" onClick={() => setQty(l.p._id, 0)} aria-label={`Remove ${l.p.name}`} className="px-1 text-slate-400">✕</button></div>
              <div className="flex items-center gap-2">
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
                  <button type="button" aria-label="Less" onClick={() => setQty(l.p._id, l.qty - 1)} className="h-10 w-10 bg-slate-50 font-bold">−</button>
                  <span className="w-9 text-center text-sm font-black tabular-nums">{l.qty}</span>
                  <button type="button" aria-label="More" onClick={() => setQty(l.p._id, l.qty + 1)} disabled={l.qty >= stockOf(l.p)} className="h-10 w-10 bg-slate-50 font-bold disabled:opacity-30">+</button>
                </div>
                <span className="text-xs text-slate-500">×</span>
                <input inputMode="numeric" aria-label={`Price of ${l.p.name}`} value={l.price} onChange={(e) => setPrice(l.p._id, e.target.value)} className="min-h-10 w-24 rounded-xl border border-slate-200 px-2 text-sm" />
                <span className="ml-auto text-sm font-black">{fmt(l.qty * (Number(l.price) || 0))}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <>
          <input inputMode="numeric" placeholder="Discount (KES)" aria-label="Discount" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, "").slice(0, 8))} className={field} />
          <div className="flex items-end justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-500">Total</span><span className="text-2xl font-black text-emerald-800">{fmt(Math.max(0, total))}</span></div>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Payment method">
            {[["cash", "💵 Cash"], ["mpesa", "📲 M-Pesa"], ...(canCredit ? [["credit", "📒 Credit"]] : [])].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={method === v} onClick={() => { setMethod(v); setTendered(""); }} className={`flex-1 rounded-xl py-2.5 text-xs font-black ${method === v ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>

          {onCredit && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <input placeholder="Find a customer by name or phone" aria-label="Find a customer" value={custQ} onChange={(e) => setCustQ(e.target.value)} className={field} />
              <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="Customer" className={field}>
                <option value="">Choose a customer…</option>
                {custMatches.map((c) => <option key={c._id} value={c._id}>{c.name}{c.phone ? ` · …${c.phone.slice(-4)}` : ""} · owes {fmt(c.balance + (pending.credit[c._id] || 0))}</option>)}
              </select>
              {customers.length === 0 && <p className="text-[11px] text-slate-500">No customers saved yet. Add them in the Customers tab.</p>}
              <input inputMode="numeric" placeholder="Paid now (optional)" aria-label="Paid now" value={deposit} onChange={(e) => { setDeposit(e.target.value.replace(/\D/g, "").slice(0, 8)); setTendered(""); }} className={field} />
              {dep > 0 && <div className="flex gap-1 rounded-xl bg-white p-1">{["cash", "mpesa"].map((v) => <button key={v} type="button" aria-pressed={depMethod === v} onClick={() => setDepMethod(v)} className={`flex-1 rounded-lg py-2 text-xs font-bold ${depMethod === v ? "bg-emerald-700 text-white" : "text-slate-500"}`}>{v === "cash" ? "Cash" : "M-Pesa"}</button>)}</div>}
              {cust && <p className={`text-xs font-bold ${overLimit ? "text-red-600" : "text-slate-600"}`}>On credit: {fmt(Math.max(0, creditAmt))} · they'd owe {fmt(owed + Math.max(0, creditAmt))}{cust.creditLimit != null ? ` of ${fmt(cust.creditLimit)} limit` : ""}{overLimit ? (online ? ". Over the limit." : ". Over the limit: it will be flagged when it syncs.") : ""}</p>}
            </div>
          )}

          {paidMethod === "cash" && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">{quick.map((n) => <button key={n} type="button" onClick={() => setTendered(String(n))} className="rounded-full border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50">{n === due ? "Exact" : n.toLocaleString("en-KE")}</button>)}</div>
              <input inputMode="numeric" placeholder="Cash received" aria-label="Cash received" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, "").slice(0, 9))} className={field} />
              {tendered !== "" && <p className={`text-sm font-black ${change < 0 ? "text-red-600" : "text-emerald-700"}`}>{change < 0 ? `Short by ${fmt(-change)}` : `Change: ${fmt(change)}`}</p>}
            </div>
          )}
          {paidMethod === "mpesa" && (
            <div className="space-y-1">
              <input placeholder="M-Pesa code (optional)" aria-label="M-Pesa code" maxLength={10} value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value.toUpperCase())} className={field} />
              <p className="text-[11px] text-slate-500">The customer pays your till or phone. Check your M-Pesa message before handing over the goods. Sokodigi only records the sale.</p>
            </div>
          )}
          {!onCredit && <input placeholder="Customer name (optional)" aria-label="Customer name" maxLength={80} value={customerName} onChange={(e) => setCustomerName(e.target.value)} className={field} />}

          {!online && <p className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-700">Offline: this sale will be saved on the device and sent when you're back online.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
          <button type="button" onClick={charge} disabled={busy || !ready || cashShort} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-40">
            {busy ? "Recording…" : onCredit ? `Put ${fmt(Math.max(0, creditAmt))} on credit` : `Charge ${fmt(Math.max(0, total))}`}
          </button>
          <button type="button" onClick={reset} disabled={busy} className="w-full text-[11px] font-bold text-slate-500 underline">Clear this sale</button>
        </>
      )}
    </div>
  );

  return (
    <div className="pb-24 lg:pb-0">
      {!online && <p role="status" className="mb-3 rounded-xl bg-slate-900 px-4 py-3 text-xs font-bold text-white">You're offline. You can keep selling: sales are saved on this device and sent when you reconnect.</p>}
      {savedAt && <p className="mb-3 text-[11px] text-slate-500">Products as last saved {new Date(savedAt).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.</p>}
      {truncated && <p className="mb-3 text-[11px] text-amber-800">Only the first 3,000 products are available on the POS. Use search.</p>}
      {outbox.notice && <p role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">{outbox.notice}<button type="button" onClick={outbox.clearNotice} className="shrink-0 underline">OK</button></p>}
      <OutboxPanel outbox={outbox} onReceipt={setReceipt} />
      {!sheet && error && items.length === 0 && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</p>}
  {scanMsg && !scan && (
  <p
    role="status"
    className={`mb-3 rounded-xl px-3 py-2 text-xs font-bold ${
      scanMsg.ok
        ? "bg-emerald-50 text-emerald-800"
        : "bg-amber-50 text-amber-900"
    }`}
  >
    {scanMsg.t}
  </p>
)}
      
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section aria-label="Products">
           <div className="mb-3 flex gap-2">
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or scan…" aria-label="Search products"
                    onKeyDown={(e) => { if (e.key === "Enter") { const c = q.trim(); if (c && catalog.some((x) => x.barcode === c)) { e.preventDefault(); onCode(c); setQ(""); } } }}
                    className={field} />
                  {canScan && <button type="button" onClick={() => { setScanMsg(null); setScan(true); }} aria-label="Scan with the camera" className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-sm font-black text-white">📷 Scan</button>}
                </div>
          {loading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
            : shown.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">{q ? "No product matches that search." : "Add products in the Inventory tab first."}</p>
            : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {shown.map((p) => {
                  const inCart = cart[p._id]?.qty || 0, left = stockOf(p), out = left <= 0, img = sizedImage(p.imageUrl, 200);
                  return (
                    <button key={p._id} type="button" onClick={() => add(p)} disabled={out || inCart >= left}
                      className="relative flex min-h-[7.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.98] enabled:hover:border-emerald-300 disabled:opacity-50">
                      {img ? <img src={img} alt="" loading="lazy" className="h-16 w-full object-cover" /> : <div className="flex h-16 items-center justify-center bg-slate-100 text-xl">📦</div>}
                      <div className="p-2.5"><p className="line-clamp-2 text-xs font-bold text-slate-800">{p.name}</p><p className="mt-0.5 text-sm font-black text-emerald-800">{fmt(p.price)}</p>
                        <p className={`text-[10px] font-semibold ${out ? "text-red-600" : left <= 10 ? "text-amber-600" : "text-slate-400"}`}>{out ? "Out of stock" : `${left} left`}</p></div>
                      {inCart > 0 && <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-700 px-1.5 text-[11px] font-black text-white">{inCart}</span>}
                    </button>
                  );
                })}
              </div>
            )}
        </section>
        <aside className="hidden self-start rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:block"><h2 className="mb-2 text-sm font-black text-slate-800">Current sale</h2>{cartPanel}</aside>
      </div>

{items.length > 0 && (      
        <div className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur md:bottom-0 lg:hidden">
          <button type="button" onClick={() => setSheet(true)} className="mx-auto flex min-h-12 w-full max-w-2xl items-center justify-between rounded-xl bg-emerald-700 px-5 text-sm font-black text-white"><span>{count} item{count === 1 ? "" : "s"} · Review</span><span>{fmt(Math.max(0, total))}</span></button>
        </div>
      )}
      {sheet && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setSheet(false)}>
          <div role="dialog" aria-modal="true" aria-label="Current sale" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between"><h3 className="text-base font-black text-slate-900">Current sale</h3><button type="button" onClick={() => setSheet(false)} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button></div>
            {cartPanel}
          </div>
        </div>
      )}
      {receipt && <ReceiptSheet sale={receipt} shop={shop} onClose={() => { setReceipt(null); if (items.length) reset(); }} onNew={() => { setReceipt(null); reset(); }} />}
   {scan && <BarcodeScanner status={scanMsg} onCode={onCode} onClose={() => setScan(false)} title="Scan to add to the sale" />}
</div>
  );
}
