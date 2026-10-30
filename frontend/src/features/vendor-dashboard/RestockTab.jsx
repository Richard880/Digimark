import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import useEntitlements from "../membership/useEntitlements";
import ROUTES from "../../constants/routes";
import BarcodeScanner from "./pos/BarcodeScanner";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const when = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const btn = "min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-50";
const STATUS = {
  draft: ["Draft", "bg-slate-200 text-slate-700"], ordered: ["Ordered", "bg-sky-100 text-sky-800"], partial: ["Part received", "bg-amber-100 text-amber-800"],
  received: ["Received", "bg-emerald-100 text-emerald-800"], closed: ["Closed", "bg-slate-200 text-slate-600"], cancelled: ["Cancelled", "bg-slate-200 text-slate-600"],
};
const ERR = {
  OVER_RECEIVING: "You can't receive more than you ordered.", NOT_RECEIVABLE: "This order can't receive stock any more.", STOCK_CHANGE_NOT_POSSIBLE: "That would take a product over the stock limit.",
  NOT_EDITABLE: "Only drafts can be edited.", INVALID_STATUS: "This order has already moved on. Refresh.", HAS_OPEN_ORDERS: "Finish or cancel this supplier's open orders first.",
  SUPPLIER_NOT_FOUND: "That supplier was removed.", PRODUCT_NOT_FOUND: "A product on this order no longer exists.", DUPLICATE_PRODUCT: "A product appears twice.",
  INVALID_LINES: "Check the quantities and prices. Use whole numbers.", INVALID_PHONE: "Enter a Kenyan number like 0712345678.", INVALID_NAME: "Enter a name.",
  PLAN_UPGRADE_REQUIRED: "That needs an active membership on a plan with suppliers.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.", INVALID_DATE: "Choose a valid date.",
};
const errMsg = (e) => (!e.response ? "Couldn't reach Sokodigi. Restock orders can't be changed offline." : e.response.data?.error === "OVER_RECEIVING" ? `You can't receive more than you ordered of ${e.response.data.product}.` : ERR[e.response.data?.error] || "Something went wrong. Please try again.");

function Sheet({ title, onClose, children, z = 3000 }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" style={{ zIndex: z }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button></div>
        {children}
      </div>
    </div>
  );
}
const Err = ({ text }) => (text ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{text}</p> : null);
const digits = (v) => v.replace(/\D/g, "").slice(0, 8);

function SuppliersSheet({ suppliers, onClose, onChanged }) {
  const [edit, setEdit] = useState(null); // null = list, {} = new, {…} = editing
  const [f, setF] = useState({ name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const open = (s) => { setEdit(s); setF({ name: s.name || "", phone: s.phone ? `0${s.phone.slice(3)}` : "", note: s.note || "" }); setError(""); };
  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError(ERR.INVALID_NAME);
    setBusy(true); setError("");
    const body = { name: f.name.trim(), phone: f.phone.trim() || null, note: f.note.trim() };
    try { edit._id ? await apiClient.patch(`/supply/suppliers/${edit._id}`, body) : await apiClient.post("/supply/suppliers", body); setEdit(null); onChanged(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  const archive = async (s) => {
    if (!window.confirm(`Remove ${s.name}? Past orders keep their details.`)) return;
    try { await apiClient.patch(`/supply/suppliers/${s._id}`, { archived: true }); onChanged(); } catch (x) { setError(errMsg(x)); }
  };
  return (
    <Sheet title={edit ? (edit._id ? "Edit supplier" : "Add a supplier") : "Suppliers"} onClose={busy ? () => {} : onClose}>
      {edit ? (
        <form onSubmit={save} className="space-y-3">
          <input className={field} placeholder="Name" aria-label="Name" maxLength={80} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input className={field} type="tel" inputMode="tel" placeholder="Phone (optional)" aria-label="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={field} placeholder="Note (optional)" aria-label="Note" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <Err text={error} />
          <div className="flex gap-2"><button type="button" onClick={() => setEdit(null)} className={`${btn} flex-1 bg-slate-100 text-slate-700`}>Back</button><button type="submit" disabled={busy} className={`${btn} flex-1 bg-emerald-700 text-white`}>{busy ? "Saving…" : "Save"}</button></div>
        </form>
      ) : (
        <div className="space-y-3">
          {suppliers.length === 0 ? <p className="py-4 text-center text-xs text-slate-500">No suppliers yet.</p> : (
            <ul className="divide-y divide-slate-100">
              {suppliers.map((s) => (
                <li key={s._id} className="flex items-center justify-between gap-3 py-3 text-xs">
                  <div className="min-w-0"><p className="truncate font-black text-slate-900">{s.name}</p><p className="text-slate-500">{s.phone ? `…${s.phone.slice(-9)}` : "No phone"}{s.note ? ` · ${s.note}` : ""}</p></div>
                  <div className="flex shrink-0 gap-3 font-bold"><button type="button" onClick={() => open(s)} className="text-emerald-700 underline">Edit</button><button type="button" onClick={() => archive(s)} className="text-red-600 underline">Remove</button></div>
                </li>
              ))}
            </ul>
          )}
          <Err text={error} />
          <button type="button" onClick={() => open({})} className={`${btn} w-full bg-emerald-700 text-white`}>+ Add supplier</button>
        </div>
      )}
    </Sheet>
  );
}

function OrderForm({ order, suppliers, catalog, costs, prefill, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState(order?.supplierId || suppliers[0]?._id || "");
  const [lines, setLines] = useState(() => (order ? order.lines : prefill || []).map((l) => ({ productId: String(l.productId || l._id), name: l.name, quantity: String(l.qtyOrdered ?? 10), unitCost: String(l.unitCost ?? "") })));
  const [expected, setExpected] = useState(order?.expectedAt ? order.expectedAt.slice(0, 10) : "");
  const [note, setNote] = useState(order?.note || "");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const t = q.trim().toLowerCase();
  const matches = t ? catalog.filter((p) => !lines.some((l) => l.productId === p._id) && (p.name.toLowerCase().includes(t) || String(p.productCode || "").toLowerCase().includes(t) || p.barcode === q.trim())).slice(0, 6) : [];
  const addLine = (p) => { setLines((ls) => [...ls, { productId: p._id, name: p.name, quantity: "10", unitCost: costs[p._id] != null ? String(costs[p._id]) : "" }]); setQ(""); };
  const setL = (i, k, v) => setLines((ls) => ls.map((l, n) => (n === i ? { ...l, [k]: digits(v) } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const submit = async (place) => {
    if (!supplierId) return setError("Choose a supplier first.");
    if (!lines.length) return setError("Add at least one product.");
    if (lines.some((l) => l.quantity === "" || l.unitCost === "" || Number(l.quantity) < 1)) return setError(ERR.INVALID_LINES);
    const body = { supplierId, note: note.trim(), expectedAt: expected || null, lines: lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })) };
    setBusy(true); setError("");
    try {
      let data;
      if (order) { ({ data } = await apiClient.put(`/supply/orders/${order._id}`, body)); if (place) await apiClient.post(`/supply/orders/${order._id}/place`); }
      else ({ data } = await apiClient.post("/supply/orders", { ...body, place }));
      onSaved(data.order);
    } catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };

  return (
    <Sheet title={order ? `Edit ${order.poNumber}` : "New restock order"} onClose={busy ? () => {} : onClose}>
      <div className="space-y-3">
        <select className={field} aria-label="Supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
          <option value="">Choose a supplier…</option>{suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <div className="relative">
          <input className={field} placeholder="Add a product: search name, SKU or barcode" aria-label="Add a product" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.length > 0 && <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">{matches.map((p) => <li key={p._id}><button type="button" onClick={() => addLine(p)} className="block w-full px-3 py-2.5 text-left text-xs font-bold text-slate-800 hover:bg-emerald-50">{p.name} <span className="font-normal text-slate-500">· {p.quantity} in stock</span></button></li>)}</ul>}
        </div>
        {lines.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <li key={l.productId} className="space-y-1.5 py-2.5">
                <div className="flex items-start justify-between gap-2"><p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{l.name}</p><button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} className="px-1 text-slate-400">✕</button></div>
                <div className="flex items-center gap-2">
                  <input inputMode="numeric" aria-label={`Quantity of ${l.name}`} placeholder="Qty" value={l.quantity} onChange={(e) => setL(i, "quantity", e.target.value)} className="min-h-10 w-20 rounded-xl border border-slate-200 px-2 text-sm" />
                  <span className="text-xs text-slate-500">× KES</span>
                  <input inputMode="numeric" aria-label={`Unit cost of ${l.name}`} placeholder="Cost each" value={l.unitCost} onChange={(e) => setL(i, "unitCost", e.target.value)} className="min-h-10 w-24 rounded-xl border border-slate-200 px-2 text-sm" />
                  <span className="ml-auto text-sm font-black">{fmt((Number(l.quantity) || 0) * (Number(l.unitCost) || 0))}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2"><input type="date" className={field} aria-label="Expected delivery" value={expected} onChange={(e) => setExpected(e.target.value)} /><input className={field} placeholder="Note (optional)" aria-label="Note" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <p className="text-right text-lg font-black text-emerald-800">Total {fmt(total)}</p>
        <Err text={error} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" disabled={busy} onClick={() => submit(false)} className={`${btn} border border-slate-200 text-slate-700`}>Save draft</button>
          <button type="button" disabled={busy} onClick={() => submit(true)} className={`${btn} bg-emerald-700 text-white`}>{busy ? "Saving…" : "Place order"}</button>
        </div>
      </div>
    </Sheet>
  );
}

function ReceiveSheet({ order, onClose, onDone }) {
  const [qty, setQty] = useState(() => Object.fromEntries(order.lines.map((l) => [String(l.productId), String(l.qtyOrdered - l.qtyReceived)])));
  const [updateCost, setUpdateCost] = useState(true);
  const [scan, setScan] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(crypto.randomUUID().replace(/-/g, "")); // one reference per attempt, so a retry can't add the stock twice
  const qtyRef = useRef(qty); qtyRef.current = qty;

  const rest = (l) => l.qtyOrdered - l.qtyReceived;
  const onCode = (code) => {
    const l = order.lines.find((x) => x.barcode && x.barcode === code);
    if (!l) return setScanMsg({ ok: false, t: `${code} isn't on this order.` });
    // First scan starts counting from 0 so the number matches what you physically count
    const first = !scanned.current.has(String(l.productId));
    scanned.current.add(String(l.productId));
    const cur = first ? 0 : Number(qtyRef.current[String(l.productId)]) || 0;
    if (cur >= rest(l)) return setScanMsg({ ok: false, t: `${l.name}: that's everything you ordered.` });
    setQty((s) => ({ ...s, [String(l.productId)]: String(cur + 1) }));
    setScanMsg({ ok: true, t: `${l.name}: ${cur + 1} of ${rest(l)}` });
  };
  const scanned = useRef(new Set());

  const submit = async () => {
    const lines = order.lines.map((l) => ({ productId: String(l.productId), quantity: Number(qty[String(l.productId)]) || 0 })).filter((l) => l.quantity > 0);
    if (!lines.length) return setError("Enter how many of at least one product arrived.");
    if (order.lines.some((l) => (Number(qty[String(l.productId)]) || 0) > rest(l))) return setError("You can't receive more than you ordered.");
    setBusy(true); setError("");
    try { await apiClient.post(`/supply/orders/${order._id}/receive`, { clientRef: ref.current, lines, updateCost }); onDone(); }
    catch (x) { setError(!x.response ? "Couldn't confirm. Tap Receive again: stock won't be added twice." : errMsg(x)); if (x.response) ref.current = crypto.randomUUID().replace(/-/g, ""); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title={`Receive ${order.poNumber}`} onClose={busy ? () => {} : onClose} z={3100}>
      <div className="space-y-3">
        <p className="text-xs text-slate-500">Enter what actually arrived. You can receive in several deliveries.</p>
        <button type="button" onClick={() => { setScanMsg(null); setScan(true); }} className={`${btn} w-full bg-slate-900 text-white`}>📷 Scan items as they arrive</button>
        <ul className="divide-y divide-slate-100">
          {order.lines.filter((l) => rest(l) > 0).map((l) => (
            <li key={String(l.productId)} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <div className="min-w-0"><p className="truncate font-bold text-slate-800">{l.name}</p><p className="text-slate-500">{rest(l)} still to come</p></div>
              <input inputMode="numeric" aria-label={`Received ${l.name}`} value={qty[String(l.productId)] ?? ""} onChange={(e) => setQty((s) => ({ ...s, [String(l.productId)]: digits(e.target.value) }))} className="min-h-10 w-20 rounded-xl border border-slate-200 px-2 text-center text-sm" />
            </li>
          ))}
        </ul>
        <label className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><input type="checkbox" checked={updateCost} onChange={(e) => setUpdateCost(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" /><span>Update my cost prices to what I paid on this order (used for profit reports).</span></label>
        <Err text={error} />
        <button type="button" onClick={submit} disabled={busy} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Adding stock…" : "Receive into stock"}</button>
      </div>
      {scan && <BarcodeScanner status={scanMsg} onCode={onCode} onClose={() => setScan(false)} title="Scan received items" />}
    </Sheet>
  );
}

function Detail({ id, shopName, writable, canScan, onClose, onChanged, onEdit }) {
  const [po, setPo] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [receive, setReceive] = useState(false);
  const load = useCallback(async () => { try { setPo((await apiClient.get(`/supply/orders/${id}`)).data.order); } catch (e) { setError(errMsg(e)); } }, [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (path, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true); setError("");
    try { await apiClient.post(`/supply/orders/${id}/${path}`); await load(); onChanged(); } catch (e) { setError(errMsg(e)); } finally { setBusy(false); }
  };
  const share = () => {
    const rows = po.lines.map((l) => `${l.qtyOrdered} x ${l.name} @ KES ${l.unitCost.toLocaleString("en-KE")}`);
    const text = [`Order ${po.poNumber} from ${shopName}`, "", ...rows, "", `Total: KES ${po.total.toLocaleString("en-KE")}`, ...(po.expectedAt ? [`Needed by: ${when(po.expectedAt)}`] : []), ...(po.note ? [po.note] : [])].join("\n");
    window.open(`https://wa.me/${po.supplierPhone || ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const [label, tone] = po ? STATUS[po.status] : ["", ""];
  return (
    <Sheet title={po ? `${po.poNumber} · ${po.supplierName}` : "Restock order"} onClose={onClose}>
      {!po ? <p className="py-6 text-center text-xs text-slate-500">{error || "Loading…"}</p> : (
        <div className="space-y-3">
          <div className="flex items-center justify-between"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span><span className="text-xs text-slate-500">{when(po.createdAt)}{po.expectedAt ? ` · needed by ${when(po.expectedAt)}` : ""}</span></div>
          <ul className="divide-y divide-slate-100 text-xs">
            {po.lines.map((l) => (
              <li key={String(l.productId)} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><p className="truncate font-bold text-slate-800">{l.name}</p><p className="text-slate-500">{fmt(l.unitCost)} each</p></div>
                <div className="shrink-0 text-right"><p className="font-black">{l.qtyReceived} / {l.qtyOrdered}</p><p className="text-[10px] text-slate-400">received</p></div>
              </li>
            ))}
          </ul>
          <p className="text-right text-sm font-black text-slate-900">Total {fmt(po.total)}</p>
          {po.note && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{po.note}</p>}
          <Err text={error} />
          <div className="grid grid-cols-2 gap-2">
            {po.status !== "cancelled" && <button type="button" onClick={share} className={`${btn} border border-slate-200 text-slate-700`}>Send on WhatsApp</button>}
            {writable && po.status === "draft" && <><button type="button" onClick={() => { onClose(); onEdit(po); }} className={`${btn} border border-slate-200 text-slate-700`}>Edit</button><button type="button" disabled={busy} onClick={() => act("place")} className={`${btn} bg-emerald-700 text-white`}>Mark as ordered</button></>}
            {writable && ["ordered", "partial"].includes(po.status) && <button type="button" disabled={busy} onClick={() => setReceive(true)} className={`${btn} bg-emerald-700 text-white`}>Receive stock</button>}
            {writable && po.status === "partial" && <button type="button" disabled={busy} onClick={() => act("close", "Close this order? Anything that hasn't arrived will no longer be expected.")} className={`${btn} bg-slate-100 text-slate-700`}>Close order</button>}
            {writable && ["draft", "ordered"].includes(po.status) && <button type="button" disabled={busy} onClick={() => act("cancel", "Cancel this order?")} className={`${btn} bg-red-50 text-red-700`}>Cancel order</button>}
          </div>
        </div>
      )}
      {receive && po && <ReceiveSheet order={po} onClose={() => setReceive(false)} onDone={() => { setReceive(false); load(); onChanged(); }} />}
    </Sheet>
  );
}

export default function RestockTab() {
  const { auth } = useAuth();
  const { ent } = useEntitlements();
  const shopName = auth.profile?.brandName || "Sokodigi shop";
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [state, setState] = useState("loading");
  const [suppliers, setSuppliers] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [costs, setCosts] = useState({});
  const [dialog, setDialog] = useState(null); // { type: "form"|"detail"|"suppliers", ... }
  const [msg, setMsg] = useState("");

  const load = useCallback(async (p = 1) => {
    try {
      const { data } = await apiClient.get("/supply/orders", { params: { status: status || undefined, page: p } });
      setOrders((prev) => (p === 1 ? data.orders : [...prev, ...data.orders])); setMore(data.hasMore); setPage(p); setState("ready");
    } catch { setState("error"); }
  }, [status]);
  const loadSuppliers = useCallback(() => { apiClient.get("/supply/suppliers").then(({ data }) => setSuppliers(data.suppliers)).catch(() => {}); }, []);
  useEffect(() => { load(1); }, [load]);
  useEffect(() => {
    loadSuppliers();
    apiClient.get("/pos/catalog").then(({ data }) => setCatalog(data.products)).catch(() => {});
    apiClient.get("/inventory/costs").then(({ data }) => setCosts(data.costs || {})).catch(() => {});
  }, [loadSuppliers]);

  if (ent && ent.active && !ent.features.suppliers) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl" aria-hidden="true">🚚</p>
        <h2 className="mt-2 text-lg font-black text-slate-900">Suppliers and restock orders</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">Keep your suppliers, order stock, and receive deliveries straight into your inventory. Available from Merchant Pro (KSh 200 a month).</p>
        <Link to={ROUTES.MEMBERSHIP} className="mt-4 inline-block min-h-11 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-black text-white">Compare plans</Link>
      </div>
    );
  }
  const writable = !!ent?.active && !!ent.features.suppliers;
  const changed = () => load(1);

  const restockLow = async () => {
    setMsg("");
    if (suppliers.length === 0) return setMsg("Add a supplier first.");
    try {
      const { data } = await apiClient.get("/supply/low-stock");
      if (!data.products.length) return setMsg("Nothing is low on stock right now.");
      setDialog({ type: "form", prefill: data.products.map((p) => ({ productId: p._id, name: p.name, qtyOrdered: 10, unitCost: p.unitCost ?? "" })) });
    } catch (e) { setMsg(errMsg(e)); }
  };

  return (
    <section className="space-y-4" aria-label="Restock">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-900">Restock</h2><p className="text-xs text-slate-500">Order from suppliers and receive deliveries into stock.</p></div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setDialog({ type: "suppliers" })} className={`${btn} border border-slate-200 text-slate-700`}>Suppliers</button>
          {writable && <button type="button" onClick={restockLow} className={`${btn} border border-amber-300 bg-amber-50 text-amber-900`}>Restock low items</button>}
          {writable && <button type="button" onClick={() => suppliers.length ? setDialog({ type: "form" }) : setMsg("Add a supplier first.")} className={`${btn} bg-emerald-700 text-white`}>+ New order</button>}
        </div>
      </div>
      {msg && <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900">{msg}</p>}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter orders">
        {[["", "All"], ["draft", "Drafts"], ["ordered", "Ordered"], ["partial", "Part received"], ["received", "Received"]].map(([v, l]) => (
          <button key={v || "all"} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold ${status === v ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`}>{l}</button>
        ))}
      </div>
      {state === "loading" && <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />}
      {state === "error" && <p role="alert" className="text-xs font-bold text-red-600">Couldn't load restock orders. <button type="button" onClick={() => load(1)} className="underline">Try again</button></p>}
      {state === "ready" && orders.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">No restock orders yet. Add a supplier, then create your first order.</p>}
      {orders.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {orders.map((o) => {
            const [label, tone] = STATUS[o.status];
            return (
              <li key={o._id}><button type="button" onClick={() => setDialog({ type: "detail", id: o._id })} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50">
                <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{o.poNumber} · {o.supplierName}</p><p className="text-xs text-slate-500">{when(o.createdAt)} · {o.lines.length} item{o.lines.length === 1 ? "" : "s"}</p></div>
                <div className="shrink-0 text-right"><p className="text-sm font-black">{fmt(o.total)}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${tone}`}>{label}</span></div>
              </button></li>
            );
          })}
        </ul>
      )}
      {more && <div className="text-center"><button type="button" onClick={() => load(page + 1)} className={`${btn} border border-slate-200 bg-white px-8 text-slate-700`}>Show more</button></div>}

      {dialog?.type === "suppliers" && <SuppliersSheet suppliers={suppliers} onClose={() => setDialog(null)} onChanged={loadSuppliers} />}
      {dialog?.type === "form" && <OrderForm order={dialog.order} prefill={dialog.prefill} suppliers={suppliers} catalog={catalog} costs={costs} onClose={() => setDialog(null)} onSaved={(o) => { setDialog(null); changed(); setDialog({ type: "detail", id: o._id }); }} />}
      {dialog?.type === "detail" && <Detail id={dialog.id} shopName={shopName} writable={writable} onClose={() => setDialog(null)} onChanged={changed} onEdit={(order) => setDialog({ type: "form", order })} />}
    </section>
  );
}
