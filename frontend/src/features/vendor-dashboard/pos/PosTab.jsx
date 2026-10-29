import { useCallback, useEffect, useRef, useState } from "react";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import { sizedImage } from "../../../utils/image";
import { ReceiptSheet } from "./Receipt";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const up = (n, s) => Math.ceil(n / s) * s;
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = {
  INSUFFICIENT_STOCK: "Not enough stock", PLAN_UPGRADE_REQUIRED: "Your membership has expired. Renew to keep selling.",
  INVALID_DISCOUNT: "The discount must be less than the total.", INSUFFICIENT_TENDER: "The cash given is less than the total.",
  INVALID_PRICE: "Check the prices.", INVALID_LINES: "Check the items and quantities.", INVALID_MPESA_REF: "The M-Pesa code is 10 letters and numbers.",
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.", PRODUCT_NOT_FOUND: "A product in the cart no longer exists.",
};

export default function PosTab() {
  const { auth } = useAuth();
  const [q, setQ] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState({});           // id -> { p, qty, price (text) }
  const [discount, setDiscount] = useState("");
  const [method, setMethod] = useState("cash");
  const [tendered, setTendered] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [customer, setCustomer] = useState("");
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState(null);
  const key = useRef(null);

  const shop = { name: auth.profile?.brandName || "Sokodigi shop", place: auth.profile?.location?.county || "" };

  const load = useCallback(async (term) => {
    try { const { data } = await apiClient.get("/pos/products", { params: { q: term || undefined } }); setProducts(data.products || []); }
    catch { setError("Couldn't load your products. Check your connection."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q.trim()), 250); return () => clearTimeout(t); }, [q, load]);

  const add = (p) => setCart((c) => {
    const qty = (c[p._id]?.qty || 0) + 1;
    return qty > p.quantity ? c : { ...c, [p._id]: { p, qty, price: c[p._id]?.price ?? String(p.price) } };
  });
  const setQty = (id, n) => setCart((c) => {
    const cur = c[id]; if (!cur) return c;
    if (n <= 0) { const { [id]: _drop, ...rest } = c; return rest; }
    return { ...c, [id]: { ...cur, qty: Math.min(n, cur.p.quantity) } };
  });
  const setPrice = (id, v) => setCart((c) => ({ ...c, [id]: { ...c[id], price: v.replace(/\D/g, "").slice(0, 7) } }));

  const items = Object.values(cart);
  const count = items.reduce((t, l) => t + l.qty, 0);
  const subtotal = items.reduce((t, l) => t + l.qty * (Number(l.price) || 0), 0);
  const disc = /^\d{1,8}$/.test(discount) ? Number(discount) : 0;
  const total = subtotal - disc;
  const given = tendered === "" ? total : Number(tendered);
  const change = given - total;
  const ready = items.length > 0 && total >= 1 && disc < subtotal && items.every((l) => Number(l.price) >= 1);
  const quick = [...new Set([total, up(total, 100), up(total, 500), up(total, 1000)])].filter((n) => n >= total && n > 0).slice(0, 4);

  const reset = () => { setCart({}); setDiscount(""); setTendered(""); setMpesaRef(""); setCustomer(""); setSheet(false); setError(""); key.current = null; };

  const charge = async () => {
    if (busy || !ready) return;
    if (method === "cash" && tendered !== "" && given < total) return setError(ERR.INSUFFICIENT_TENDER);
    setBusy(true); setError("");
    if (!key.current) key.current = crypto.randomUUID().replace(/-/g, "");
    try {
      const { data } = await apiClient.post("/pos/sales", {
        clientRef: key.current,
        lines: items.map((l) => ({ productId: l.p._id, quantity: l.qty, unitPrice: Number(l.price) })),
        discount: disc, paymentMethod: method,
        amountTendered: method === "cash" ? given : undefined,
        mpesaRef: method === "mpesa" ? mpesaRef.trim().toUpperCase() || undefined : undefined,
        customerName: customer.trim() || undefined,
      });
      key.current = null;
      setReceipt(data.sale); setSheet(false);
      load(q.trim());
    } catch (e) {
      if (e.response) key.current = null; // a definite answer: the next try is a new sale
      const d = e.response?.data;
      setError(!e.response ? "Couldn't confirm the sale. Tap Charge again: it won't be recorded twice."
        : d?.error === "INSUFFICIENT_STOCK" ? `Not enough stock for ${d.product}.` : ERR[d?.error] || "Something went wrong. Please try again.");
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
                  <button type="button" aria-label="More" onClick={() => setQty(l.p._id, l.qty + 1)} disabled={l.qty >= l.p.quantity} className="h-10 w-10 bg-slate-50 font-bold disabled:opacity-30">+</button>
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
          <div className="grid grid-cols-2 gap-2">
            <input inputMode="numeric" placeholder="Discount (KES)" aria-label="Discount" value={discount} onChange={(e) => setDiscount(e.target.value.replace(/\D/g, "").slice(0, 8))} className={field} />
            <input placeholder="Customer (optional)" aria-label="Customer name" maxLength={80} value={customer} onChange={(e) => setCustomer(e.target.value)} className={field} />
          </div>
          <div className="flex items-end justify-between border-t border-slate-100 pt-3"><span className="text-xs font-bold text-slate-500">Total</span><span className="text-2xl font-black text-emerald-800">{fmt(Math.max(0, total))}</span></div>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Payment method">
            {[["cash", "💵 Cash"], ["mpesa", "📲 M-Pesa"]].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={method === v} onClick={() => setMethod(v)} className={`flex-1 rounded-xl py-2.5 text-xs font-black ${method === v ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500"}`}>{l}</button>
            ))}
          </div>
          {method === "cash" ? (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">{quick.map((n) => <button key={n} type="button" onClick={() => setTendered(String(n))} className="rounded-full border border-slate-200 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50">{n === total ? "Exact" : n.toLocaleString("en-KE")}</button>)}</div>
              <input inputMode="numeric" placeholder="Cash received" aria-label="Cash received" value={tendered} onChange={(e) => setTendered(e.target.value.replace(/\D/g, "").slice(0, 9))} className={field} />
              {tendered !== "" && <p className={`text-sm font-black ${change < 0 ? "text-red-600" : "text-emerald-700"}`}>{change < 0 ? `Short by ${fmt(-change)}` : `Change: ${fmt(change)}`}</p>}
            </div>
          ) : (
            <div className="space-y-1">
              <input placeholder="M-Pesa code (optional)" aria-label="M-Pesa code" maxLength={10} value={mpesaRef} onChange={(e) => setMpesaRef(e.target.value.toUpperCase())} className={field} />
              <p className="text-[11px] text-slate-500">The customer pays your till or phone. Check your M-Pesa message before you hand over the goods. Sokodigi only records the sale.</p>
            </div>
          )}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
          <button type="button" onClick={charge} disabled={busy || !ready || (method === "cash" && tendered !== "" && given < total)} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-40">{busy ? "Recording…" : `Charge ${fmt(Math.max(0, total))}`}</button>
          <button type="button" onClick={reset} disabled={busy} className="w-full text-[11px] font-bold text-slate-500 underline">Clear this sale</button>
        </>
      )}
    </div>
  );

  return (
    <div className="pb-24 lg:pb-0">
      {!sheet && error && items.length === 0 && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <section aria-label="Products">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or SKU…" aria-label="Search products" className={`${field} mb-3`} />
          {loading ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div>
            : products.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">{q ? "No product matches that search." : "Add products in the Inventory tab first."}</p>
            : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {products.map((p) => {
                  const inCart = cart[p._id]?.qty || 0;
                  const out = p.quantity <= 0;
                  const img = sizedImage(p.imageUrl, 200);
                  return (
                    <button key={p._id} type="button" onClick={() => add(p)} disabled={out || inCart >= p.quantity}
                      className="relative flex min-h-[7.5rem] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.98] enabled:hover:border-emerald-300 disabled:opacity-50">
                      {img ? <img src={img} alt="" loading="lazy" className="h-16 w-full object-cover" /> : <div className="flex h-16 items-center justify-center bg-slate-100 text-xl">📦</div>}
                      <div className="p-2.5"><p className="line-clamp-2 text-xs font-bold text-slate-800">{p.name}</p><p className="mt-0.5 text-sm font-black text-emerald-800">{fmt(p.price)}</p>
                        <p className={`text-[10px] font-semibold ${out ? "text-red-600" : p.quantity <= 10 ? "text-amber-600" : "text-slate-400"}`}>{out ? "Out of stock" : `${p.quantity} left`}</p></div>
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
      {receipt && <ReceiptSheet sale={receipt} shop={shop} onClose={() => { setReceipt(null); reset(); }} onNew={() => { setReceipt(null); reset(); }} />}
    </div>
  );
}
