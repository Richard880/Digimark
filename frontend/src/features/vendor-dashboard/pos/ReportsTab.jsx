import { useCallback, useEffect, useState } from "react";
import apiClient from "../../../services/apiClient";
import useAuth from "../../auth/hooks/useAuth";
import { ReceiptSheet } from "./Receipt";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const today = () => new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10); // Nairobi date
const time = (d) => new Date(d).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = { VOID_WINDOW_PASSED: "A sale can only be undone within 24 hours.", ALREADY_VOIDED: "That sale was already undone.", ALREADY_CLOSED: "This day is already closed.", PLAN_UPGRADE_REQUIRED: "Your membership has expired. Renew to do this.", INVALID_AMOUNT: "Enter the cash you counted as a whole number.", INVALID_DATE: "Choose a valid date." };

export default function ReportsTab() {
  const { auth } = useAuth();
  const shop = { name: auth.profile?.brandName || "Sokodigi shop", place: auth.profile?.location?.county || "" };
  const [date, setDate] = useState(today);
  const [r, setR] = useState(null);
  const [sales, setSales] = useState([]);
  const [state, setState] = useState("loading");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState(null);
  const [view, setView] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [a, b] = await Promise.all([apiClient.get("/pos/report", { params: { date } }), apiClient.get("/pos/sales", { params: { date } })]);
      setR(a.data); setSales(b.data.sales || []); setState("ready");
    } catch { setState("error"); }
  }, [date]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); setMsg({ ok: true, t: ok }); await load(); }
    catch (e) { setMsg({ ok: false, t: e.response ? ERR[e.response.data?.error] || "Something went wrong. Please try again." : "Couldn't reach Sokodigi." }); }
    finally { setBusy(false); }
  };
  const voidSale = (s) => window.confirm(`Undo receipt ${s.receiptNo}? The stock goes back into your inventory.`) && act(() => apiClient.post(`/pos/sales/${s._id}/void`), "Sale undone and stock restored.");
  const close = (e) => { e.preventDefault(); if (!/^\d{1,9}$/.test(counted)) return setMsg({ ok: false, t: ERR.INVALID_AMOUNT }); act(() => apiClient.post("/pos/close", { date, countedCash: Number(counted), note: note.trim() }), "Day closed."); };

  const card = (l, v, tone = "") => <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold text-slate-500">{l}</p><p className={`mt-1 truncate text-xl font-black ${tone || "text-slate-900"}`}>{v}</p></div>;

   return (
    <section className="space-y-4" aria-label="Reports">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-lg font-black text-slate-900">Daily report</h2><p className="text-xs text-slate-500">Counter sales for the day, in Nairobi time.</p></div>
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Report date" className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm" />
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl border px-4 py-3 text-xs font-bold ${msg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{msg.t}</p>}
      {state === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}
      {state === "error" && <p role="alert" className="text-xs font-bold text-red-600">Couldn't load the report. <button type="button" onClick={load} className="underline">Try again</button></p>}

      {state === "ready" && r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {card("Counter sales", fmt(r.sales.revenue), "text-emerald-800")}
            {card("Transactions", r.sales.count)}
            {card("Cash", fmt(r.byPayment.cash.total))}
            {card("M-Pesa", fmt(r.byPayment.mpesa.total))}
            {card("Profit (estimate)", r.profit.costedRevenue ? fmt(r.profit.value) : "Add costs")}
            {card("Discounts given", fmt(r.sales.discount))}
            {card("Online orders paid out", `${r.online.count} · ${fmt(r.online.received)}`)}
            {card("Undone sales", r.voidedCount)}
            
            {/* 💡 New Analytics Cards Added Here */}
            {card("Credit given", fmt(r.credit?.given || 0))}
            {card("Debts collected", fmt((r.debt?.cash || 0) + (r.debt?.mpesa || 0)))}
            {card("Owed to you", fmt(r.owed?.total || 0))}
          </div>
          {r.profit.unknownCostRevenue > 0 && <p className="rounded-xl bg-amber-50 px-4 py-3 text-[11px] text-amber-900">Profit only counts items that have a cost price. {fmt(r.profit.unknownCostRevenue)} of today's sales has none. Add costs in a product's Edit screen.</p>}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-slate-800">Best sellers</h3>
            {r.items.length === 0 ? <p className="text-xs text-slate-400">No sales on this day.</p> : (
              <ul className="divide-y divide-slate-100 text-xs">
                {r.items.slice(0, 10).map((i) => <li key={i.productId} className="flex items-center justify-between gap-3 py-2"><span className="min-w-0 flex-1 truncate font-bold text-slate-800">{i.name}</span><span className="text-slate-500">{i.qty} sold</span><span className="w-24 text-right font-black">{fmt(i.revenue)}</span></li>)}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-black text-slate-800">Close the day</h3>
            {r.close ? (
              <p className={`text-xs font-bold ${r.close.difference === 0 ? "text-emerald-700" : "text-amber-700"}`}>Closed. Expected cash {fmt(r.close.expectedCash)}, counted {fmt(r.close.countedCash)}: {r.close.difference === 0 ? "balanced" : r.close.difference > 0 ? `${fmt(r.close.difference)} over` : `${fmt(-r.close.difference)} short`}.</p>
            ) : (
              <form onSubmit={close} className="space-y-2">
                {/* 💡 Updated text formula here to merge transactional cash and collected cash metrics */}
                <p className="text-xs text-slate-500">Cash sales say you should have <b>{fmt((r.byPayment.cash?.total || 0) + (r.debt?.cash || 0))}</b> in the till from today's sales (including cash collected on debts). Count it and enter the amount.</p>
                <input inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="Cash counted (KES)" aria-label="Cash counted" className={field} />
                <input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" className={field} />
                <button type="submit" disabled={busy || !counted} className="min-h-11 w-full rounded-xl bg-slate-900 text-xs font-black text-white disabled:opacity-40">Close the day</button>
              </form>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-2 text-sm font-black text-slate-800">Receipts</h3>
            {sales.length === 0 ? <p className="text-xs text-slate-400">No receipts for this day.</p> : (
              <ul className="divide-y divide-slate-100">
                {sales.map((s) => {
                  const recent = Date.now() - new Date(s.createdAt).getTime() < 24 * 3600 * 1000;
                  return (
                    <li key={s._id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs ${s.voided ? "opacity-50" : ""}`}>
                      <div className="min-w-0"><p className="font-black text-slate-800">{s.receiptNo} {s.voided && <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px]">Undone</span>}</p><p className="text-slate-500">{time(s.createdAt)} · {s.paymentMethod === "cash" ? "Cash" : s.paymentMethod === "mpesa" ? "M-Pesa" : "Credit"} · {s.lines.reduce((t, l) => t + l.quantity, 0)} items</p></div>
                      <div className="flex items-center gap-3"><span className="text-sm font-black">{fmt(s.total)}</span>
                        <button type="button" onClick={() => setView(s)} className="font-bold text-emerald-700 underline">Receipt</button>
                        {!s.voided && recent && <button type="button" disabled={busy} onClick={() => voidSale(s)} className="font-bold text-red-600 underline disabled:opacity-50">Undo</button>}</div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
      {view && <ReceiptSheet sale={view} shop={shop} onClose={() => setView(null)} />}
    </section>
  );
}
