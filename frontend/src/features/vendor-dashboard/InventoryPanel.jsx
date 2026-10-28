import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const when = (d) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const LABEL = { initial: "Opening stock", restock: "Restock", adjustment: "Adjustment", sale_marketplace: "Online sale", sale_pos: "Counter sale", return: "Returned to stock", void: "Sale undone", correction: "Correction" };

export function MovementsSheet({ product, onClose }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [state, setState] = useState("loading");

  const load = useCallback(async (p) => {
    try {
      const { data } = await apiClient.get("/inventory/movements", { params: { page: p, ...(product ? { productId: product._id } : {}) } });
      setRows((prev) => (p === 1 ? data.movements : [...prev, ...data.movements]));
      setMore(data.hasMore); setPage(p); setState("ready");
    } catch { setState("error"); }
  }, [product]);
  useEffect(() => { load(1); }, [load]);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Stock history" className="flex max-h-[90vh] w-full flex-col rounded-t-3xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-black text-slate-900">Stock history{product ? `: ${product.name}` : ""}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {state === "loading" && <p className="py-8 text-center text-xs text-slate-400">Loading…</p>}
          {state === "error" && <p className="py-8 text-center text-xs font-bold text-red-600">Couldn't load the history.</p>}
          {state === "ready" && rows.length === 0 && <p className="py-8 text-center text-xs text-slate-400">No stock movements yet.</p>}
          <ul className="divide-y divide-slate-100">
            {rows.map((m, i) => (
              <li key={`${m.createdAt}-${i}`} className="flex items-center justify-between gap-3 py-3 text-xs">
                <div className="min-w-0"><p className="truncate font-bold text-slate-800">{LABEL[m.type] || m.type}{!product && ` · ${m.productName}`}</p><p className="text-slate-500">{when(m.createdAt)}{m.note ? ` · ${m.note}` : ""}</p></div>
                <div className="shrink-0 text-right"><p className={`font-black ${m.delta > 0 ? "text-emerald-700" : "text-slate-900"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</p><p className="text-[10px] text-slate-400">now {m.balanceAfter}</p></div>
              </li>
            ))}
          </ul>
          {more && <button type="button" onClick={() => load(page + 1)} className="my-3 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700">Show more</button>}
        </div>
      </div>
    </div>
  );
}

export default function InventoryPanel({ refreshKey }) {
  const [s, setS] = useState(null);
  const [history, setHistory] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let live = true;
    apiClient.get("/inventory/summary").then(({ data }) => live && setS(data)).catch(() => {});
    return () => { live = false; };
  }, [refreshKey]);

  const exportCsv = async () => {
    setExporting(true); setErr("");
    try {
      const { data } = await apiClient.get("/inventory/export.csv", { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url; a.download = `sokodigi-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setErr("Couldn't export right now. Please try again."); } finally { setExporting(false); }
  };

  if (!s) return null;
  const pct = Math.min(100, Math.round((s.total / Math.max(1, s.limit)) * 100));
  const near = pct >= 80;

  return (
    <section className="space-y-3" aria-label="Inventory overview">
      {s.readOnly && (
        <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          Your membership has expired, so your inventory is read-only. You can still view and export it. <Link to={ROUTES.MEMBERSHIP} className="font-bold underline">Renew to keep selling</Link>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Products", s.total, ""], ["Stock value (retail)", fmt(s.retailValue), ""], ["Low stock", s.low, s.low ? "text-amber-600" : ""], ["Out of stock", s.out, s.out ? "text-red-600" : ""]].map(([l, v, c]) => (
          <div key={l} className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className={`mt-1 truncate text-xl font-black text-slate-900 ${c}`}>{v}</p></div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <p className="font-bold text-slate-800">{s.total} of {s.limit.toLocaleString("en-KE")} products <span className="font-normal text-slate-500">on {s.plan}</span></p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setHistory(true)} className="min-h-9 rounded-xl border border-slate-200 px-3 font-bold text-slate-700 hover:bg-slate-50">Stock history</button>
            <button type="button" onClick={exportCsv} disabled={exporting} className="min-h-9 rounded-xl border border-slate-200 px-3 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{exporting ? "Exporting…" : "Export CSV"}</button>
          </div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Plan usage"><div className={`h-full rounded-full ${near ? "bg-amber-500" : "bg-emerald-600"}`} style={{ width: `${pct}%` }} /></div>
        {near && !s.readOnly && <p className="mt-2 text-[11px] font-semibold text-amber-800">You're close to your plan limit. <Link to={ROUTES.MEMBERSHIP} className="font-bold underline">Compare plans</Link></p>}
        {err && <p role="alert" className="mt-2 text-xs font-bold text-red-600">{err}</p>}
      </div>
      {history && <MovementsSheet onClose={() => setHistory(false)} />}
    </section>
  );
}
