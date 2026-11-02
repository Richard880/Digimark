import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../../services/apiClient";
import useShop from "../../shop/useShop";
import ROUTES from "../../../constants/routes";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const day = (offset) => new Date(Date.now() + 3 * 3600000 - offset * 86400000).toISOString().slice(0, 10);
const RANGES = [["7 days", 6], ["30 days", 29], ["90 days", 89], ["1 year", 364]];
const field = "min-h-11 rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";

export default function ProfitTab() {
  const { shop, ent } = useShop();
  const [from, setFrom] = useState(day(29));
  const [to, setTo] = useState(day(0));
  const [branch, setBranch] = useState("all");
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");

  const load = useCallback(async () => {
    setState("loading");
    try { setD((await apiClient.get("/pos/profit", { params: { from, to, branchId: branch } })).data); setState("ready"); }
    catch (e) { setState(e.response?.data?.error === "PLAN_UPGRADE_REQUIRED" ? "locked" : e.response?.status === 400 ? "range" : "error"); }
  }, [from, to, branch]);
  useEffect(() => { if (ent?.features?.profitReports) load(); }, [load, ent]);

  if (!shop || !ent) return null;
  if (!ent.features.profitReports || state === "locked") {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><p className="text-4xl" aria-hidden="true">💹</p><h2 className="mt-2 text-lg font-black text-slate-900">Profit reports</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">See profit by day and by product. Available from Merchant Pro (KSh 200 a month).</p>
      <Link to={ROUTES.MEMBERSHIP} className="mt-4 inline-block min-h-11 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-black text-white">Compare plans</Link></div>;
  }
  const max = d ? Math.max(1, ...d.daily.map((x) => Math.abs(x.profit))) : 1;
  const card = (l, v, tone = "text-slate-900") => <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className={`mt-1 truncate text-xl font-black ${tone}`}>{v}</p></div>;

  return (
    <section className="space-y-4" aria-label="Profit">
      <div><h2 className="text-lg font-black text-slate-900">Profit</h2><p className="text-xs text-slate-500">Counter sales use the cost you recorded at the time. Online orders use your current cost prices and are an estimate.</p></div>
      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">{RANGES.map(([l, n]) => <button key={l} type="button" onClick={() => { setFrom(day(n)); setTo(day(0)); }} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-emerald-50">{l}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><input type="date" className={field} aria-label="From" max={day(0)} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /><input type="date" className={field} aria-label="To" max={day(0)} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></div>
        {shop.branches.length > 1 && <select className={`${field} w-full`} aria-label="Branch" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="all">All branches</option>{shop.branches.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}</select>}
      </div>
      {state === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}
      {state === "range" && <p role="alert" className="text-xs font-bold text-red-600">Choose valid dates, at most one year apart.</p>}
      {state === "error" && <p role="alert" className="text-xs font-bold text-red-600">Couldn't load the report. <button type="button" onClick={load} className="underline">Try again</button></p>}
      {state === "ready" && d && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {card("Sales received", fmt(d.total.revenue))}
            {card("Profit (estimate)", fmt(d.total.profit), d.total.profit < 0 ? "text-red-600" : "text-emerald-800")}
            {card("Margin", d.total.margin == null ? "Add costs" : `${d.total.margin}%`)}
            {card("Online orders paid", d.online ? `${d.online.count}` : "–")}
          </div>
          {d.total.unknown > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-[11px] text-amber-900">Profit only counts items with a cost price. {fmt(d.total.unknown)} of sales has none. Add costs in a product's Edit screen.</p>}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-black text-slate-800">Profit by {d.grouped} (counter sales)</h3>
            {d.daily.length === 0 ? <p className="text-xs text-slate-400">No counter sales in this period.</p> : (
              <div className="flex h-36 items-end gap-1 overflow-x-auto" role="img" aria-label="Profit chart">
                {d.daily.map((x) => <div key={x.d} className="flex h-full min-w-[10px] flex-1 flex-col justify-end" title={`${x.d}: ${fmt(x.profit)}`}><div className={`w-full rounded-t ${x.profit < 0 ? "bg-red-400" : "bg-emerald-600"}`} style={{ height: `${Math.max(3, (Math.abs(x.profit) / max) * 100)}%` }} /></div>)}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-slate-800">Best products (counter sales)</h3>
            {d.products.length === 0 ? <p className="text-xs text-slate-400">Nothing sold.</p> : (
              <ul className="divide-y divide-slate-100 text-xs">{d.products.map((p) => <li key={p.name} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 flex-1 truncate font-bold text-slate-800">{p.name}</span><span className="text-slate-500">{p.qty} sold</span><span className={`w-24 text-right font-black ${p.profit == null ? "text-slate-400" : p.profit < 0 ? "text-red-600" : "text-emerald-700"}`}>{p.profit == null ? "no cost" : fmt(p.profit)}</span></li>)}</ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
