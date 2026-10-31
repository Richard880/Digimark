import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";
import useShop from "./useShop";
import { Sheet, Err, field, btn, errMsg, when } from "./ui";

const digits = (v) => v.replace(/\D/g, "").slice(0, 6);

function AdjustSheet({ item, branch, onClose, onDone }) {
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [received, setReceived] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const d = /^-?\d{1,6}$/.test(delta.trim()) ? Number(delta) : NaN;
  const next = Number.isInteger(d) ? item.quantity + d : null;
  const submit = async (e) => {
    e.preventDefault();
    if (!Number.isInteger(d) || d === 0) return setError("Enter a whole number like 5 or -2.");
    if (d < 0 && note.trim().length < 3) return setError("Add a short reason when taking stock out.");
    setBusy(true); setError("");
    try { await apiClient.post("/shop/stock/adjust", { productId: item._id, branchId: branch._id, delta: d, note: note.trim(), kind: d > 0 && received ? "restock" : "adjustment" }); onDone(); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`${item.name} · ${branch.name}`} onClose={busy ? () => {} : onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">In stock here: <b>{item.quantity}</b></p>
        <div className="flex flex-wrap gap-2">{[5, 10, 20, -1].map((q) => <button key={q} type="button" onClick={() => setDelta(String(q))} className={`${btn} border border-slate-200 text-slate-700`}>{q > 0 ? `+${q}` : q}</button>)}</div>
        <input className={field} inputMode="numeric" placeholder="Add or remove, e.g. 10 or -3" aria-label="Change" value={delta} onChange={(e) => setDelta(e.target.value)} />
        {next !== null && <p className={`text-xs font-bold ${next < 0 ? "text-red-600" : "text-emerald-700"}`}>New stock: {next}</p>}
        {d > 0 && <label className="flex items-center gap-2 text-xs text-slate-700"><input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={received} onChange={(e) => setReceived(e.target.checked)} />This is new stock received</label>}
        <input className={field} maxLength={200} placeholder={d < 0 ? "Reason (required): damaged, lost, counted…" : "Note (optional)"} aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} />
        <Err text={error} />
        <button type="submit" disabled={busy || next === null || next < 0} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Saving…" : "Update stock"}</button>
      </form>
    </Sheet>
  );
}

function TransferSheet({ shop, startFrom, onClose, onDone }) {
  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [lines, setLines] = useState([]); // { _id, name, have, quantity }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(crypto.randomUUID().replace(/-/g, "")); // one reference per attempt, so a retry can't move stock twice

  useEffect(() => {
    if (!from) return undefined;
    const t = setTimeout(() => apiClient.get("/shop/stock", { params: { branchId: from, q: q.trim() || undefined } }).then(({ data }) => setHits(data.items.filter((i) => i.quantity > 0))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [from, q]);
  useEffect(() => { setLines([]); }, [from]);

  const total = lines.reduce((t, l) => t + (Number(l.quantity) || 0), 0);
  const submit = async () => {
    if (!to) return setError("Choose where the stock is going.");
    if (!lines.length || lines.some((l) => !(Number(l.quantity) >= 1) || Number(l.quantity) > l.have)) return setError("Check the quantities. You can't send more than the branch has.");
    setBusy(true); setError("");
    try { await apiClient.post("/shop/transfers", { fromBranchId: from, toBranchId: to, note: note.trim(), clientRef: ref.current, lines: lines.map((l) => ({ productId: l._id, quantity: Number(l.quantity) })) }); onDone(); }
    catch (x) { setError(!x.response ? "Couldn't confirm. Tap again: stock won't move twice." : errMsg(x)); if (x.response) ref.current = crypto.randomUUID().replace(/-/g, ""); }
    finally { setBusy(false); }
  };
  return (
    <Sheet title="Transfer stock" onClose={busy ? () => {} : onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select className={field} aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)}>{shop.branches.map((b) => <option key={b._id} value={b._id}>From {b.name}</option>)}</select>
          <select className={field} aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}><option value="">To…</option>{shop.allBranches.filter((b) => b._id !== from).map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select>
        </div>
        <div className="relative">
          <input className={field} placeholder="Add a product: search name, SKU or barcode" aria-label="Add a product" value={q} onChange={(e) => setQ(e.target.value)} />
          {q.trim() && hits.length > 0 && <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">{hits.filter((h) => !lines.some((l) => l._id === h._id)).slice(0, 8).map((h) => <li key={h._id}><button type="button" onClick={() => { setLines((ls) => [...ls, { _id: h._id, name: h.name, have: h.quantity, quantity: "1" }]); setQ(""); }} className="block w-full px-3 py-2.5 text-left text-xs font-bold text-slate-800 hover:bg-emerald-50">{h.name} <span className="font-normal text-slate-500">· {h.quantity} here</span></button></li>)}</ul>}
        </div>
        {lines.length > 0 && <ul className="divide-y divide-slate-100">{lines.map((l, i) => (
          <li key={l._id} className="flex items-center justify-between gap-2 py-2.5 text-xs">
            <div className="min-w-0"><p className="truncate font-bold text-slate-800">{l.name}</p><p className="text-slate-500">{l.have} available</p></div>
            <div className="flex items-center gap-2"><input inputMode="numeric" aria-label={`Quantity of ${l.name}`} value={l.quantity} onChange={(e) => setLines((ls) => ls.map((x, n) => (n === i ? { ...x, quantity: digits(e.target.value) } : x)))} className="min-h-10 w-20 rounded-xl border border-slate-200 px-2 text-center text-sm" /><button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))} className="px-1 text-slate-400">✕</button></div>
          </li>))}</ul>}
        <input className={field} maxLength={200} placeholder="Note (optional)" aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        <Err text={error} />
        <button type="button" onClick={submit} disabled={busy || !lines.length} className={`${btn} w-full bg-emerald-700 text-white`}>{busy ? "Moving stock…" : `Move ${total} item${total === 1 ? "" : "s"}`}</button>
      </div>
    </Sheet>
  );
}

function BranchesSheet({ shop, ent, onClose, onChanged }) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (fn) => { setBusy(true); setError(""); try { await fn(); onChanged(); } catch (x) { setError(errMsg(x)); } finally { setBusy(false); } };
  const add = (e) => { e.preventDefault(); if (!name.trim()) return setError("Enter a branch name."); run(async () => { await apiClient.post("/shop/branches", { name: name.trim(), address: address.trim() }); setName(""); setAddress(""); }); };
  const rename = (b) => { const n = window.prompt("Branch name", b.name); if (n && n.trim()) run(() => apiClient.patch(`/shop/branches/${b._id}`, { name: n.trim() })); };
  const archive = (b) => window.confirm(`Archive ${b.name}? It must have no stock and no staff assigned.`) && run(() => apiClient.patch(`/shop/branches/${b._id}`, { archived: true }));
  const locked = !ent.features.multiBranch;
  return (
    <Sheet title="Branches" onClose={busy ? () => {} : onClose}>
      <div className="space-y-3">
        <ul className="divide-y divide-slate-100 text-xs">{shop.branches.map((b) => (
          <li key={b._id} className="flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><p className="truncate font-black text-slate-900">{b.name}{b.isMain && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-800">Main · sells online</span>}</p>{b.address && <p className="text-slate-500">{b.address}</p>}</div>
            <div className="flex shrink-0 gap-3 font-bold"><button type="button" onClick={() => rename(b)} className="text-emerald-700 underline">Rename</button>{!b.isMain && <button type="button" onClick={() => archive(b)} className="text-red-600 underline">Archive</button>}</div></li>))}</ul>
        {locked ? <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Several branches are available from Smart-Hub (KSh 500 a month). <Link to={ROUTES.MEMBERSHIP} className="font-bold underline">Compare plans</Link></p> : (
          <form onSubmit={add} className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-[11px] text-slate-500">{shop.branches.length} of {ent.limits.branches} branches. Online orders are always fulfilled from the main branch.</p>
            <input className={field} placeholder="New branch name" aria-label="Branch name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            <input className={field} placeholder="Address or town (optional)" aria-label="Address" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
            <button type="submit" disabled={busy} className={`${btn} w-full bg-emerald-700 text-white`}>+ Add branch</button>
          </form>)}
        <Err text={error} />
      </div>
    </Sheet>
  );
}

export default function StockTab() {
  const { shop, ent, can, refresh } = useShop();
  const [branchId, setBranchId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [state, setState] = useState("loading");
  const [dialog, setDialog] = useState(null);
  const [transfers, setTransfers] = useState([]);

  useEffect(() => { if (shop?.branches?.length && !shop.branches.some((b) => b._id === branchId)) setBranchId(shop.branches[0]._id); }, [shop, branchId]);
  const load = useCallback(async (p = 1) => {
    if (!branchId) return;
    try {
      const { data } = await apiClient.get("/shop/stock", { params: { branchId, q: q.trim() || undefined, page: p } });
      setRows((prev) => (p === 1 ? data.items : [...prev, ...data.items])); setMore(data.hasMore); setPage(p); setState("ready");
    } catch { setState("error"); }
  }, [branchId, q]);
  useEffect(() => { const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);
  const loadTransfers = useCallback(() => { if (can("transfer")) apiClient.get("/shop/transfers").then(({ data }) => setTransfers(data.transfers)).catch(() => {}); }, [can]);
  useEffect(() => { loadTransfers(); }, [loadTransfers, shop]);

  if (!shop || !ent) return null;
  const branch = shop.branches.find((b) => b._id === branchId);
  const canTransfer = can("transfer") && ent.active && ent.features.multiBranch && shop.allBranches.length > 1;
  const canAdjust = can("stock.adjust") && ent.active;

  return (
    <section className="space-y-4" aria-label="Stock by branch">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-900">Stock by branch</h2><p className="text-xs text-slate-500">Online orders sell from the main branch. Move stock there to make it available online.</p></div>
        <div className="flex flex-wrap gap-2">
          {canTransfer && <button type="button" onClick={() => setDialog({ type: "transfer" })} className={`${btn} bg-emerald-700 text-white`}>Transfer stock</button>}
          {can("branches") && <button type="button" onClick={() => setDialog({ type: "branches" })} className={`${btn} border border-slate-200 text-slate-700`}>Manage branches</button>}
        </div>
      </div>
      {!ent.active && <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">This shop's membership has expired, so stock is read-only.</p>}
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {shop.branches.length > 1 && <select className={field} aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{shop.branches.map((b) => <option key={b._id} value={b._id}>{b.name}{b.isMain ? " (main)" : ""}</option>)}</select>}
        <input type="search" className={field} placeholder="Search name, SKU or barcode…" aria-label="Search stock" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {state === "loading" && <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />}
      {state === "error" && <p role="alert" className="text-xs font-bold text-red-600">Couldn't load stock. <button type="button" onClick={() => load(1)} className="underline">Try again</button></p>}
      {state === "ready" && rows.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">No products match.</p>}
      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((p) => (
            <li key={p._id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0"><p className="truncate text-sm font-black text-slate-900">{p.name}</p><p className="text-xs text-slate-500">{p.productCode || "No SKU"}</p></div>
              <div className="flex shrink-0 items-center gap-3"><span className={`text-sm font-black ${p.quantity <= 0 ? "text-red-600" : p.quantity <= 10 ? "text-amber-600" : "text-emerald-700"}`}>{p.quantity}</span>{canAdjust && <button type="button" onClick={() => setDialog({ type: "adjust", item: p })} className="text-xs font-bold text-emerald-700 underline">Adjust</button>}</div>
            </li>
          ))}
        </ul>
      )}
      {more && <div className="text-center"><button type="button" onClick={() => load(page + 1)} className={`${btn} border border-slate-200 bg-white px-8 text-slate-700`}>Show more</button></div>}

      {transfers.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-2 text-sm font-black text-slate-800">Recent transfers</h3>
          <ul className="divide-y divide-slate-100 text-xs">{transfers.slice(0, 10).map((t) => <li key={t._id} className="py-2.5"><p className="font-bold text-slate-800">{t.transferNo} · {t.fromName} → {t.toName}</p><p className="text-slate-500">{t.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")} · {when(t.createdAt)} · {t.byName}</p></li>)}</ul>
        </div>
      )}

      {dialog?.type === "adjust" && branch && <AdjustSheet item={dialog.item} branch={branch} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(1); }} />}
      {dialog?.type === "transfer" && <TransferSheet shop={shop} startFrom={branchId} onClose={() => setDialog(null)} onDone={() => { setDialog(null); load(1); loadTransfers(); }} />}
      {dialog?.type === "branches" && <BranchesSheet shop={shop} ent={ent} onClose={() => setDialog(null)} onChanged={refresh} />}
    </section>
  );
}
