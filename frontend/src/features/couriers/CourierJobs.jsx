import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

const when = (d) => (d ? new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const tel = (p) => `tel:${String(p).startsWith("+") ? p : `+${p}`}`;
const map = (t) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.subCounty}, ${t.county}, Kenya`)}`;

export default function CourierJobs() {
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  const load = useCallback(async () => {
    try { const { data } = await apiClient.get("/couriers/jobs"); setD(data); setState("ready"); if (!data.shops.length) { try { localStorage.removeItem("sokodigi_courier"); } catch { /* ignore */ } } }
    catch { setState("error"); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === "visible" && load(), 60000); return () => clearInterval(t); }, [load]);
  const leave = async (s) => { if (window.confirm(`Stop delivering for ${s.name}?`)) { try { await apiClient.post(`/couriers/leave/${s.memberId}`); load(); } catch { /* try again */ } } };

  if (state === "loading") return <div className="mx-auto max-w-2xl px-4 py-6"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>;
  if (state === "error") return <p className="py-20 text-center text-xs text-slate-600">Couldn't load your deliveries. <button type="button" onClick={load} className="font-bold text-emerald-700 underline">Try again</button></p>;
  if (!d.shops.length) return <div className="px-4 py-20 text-center text-sm text-slate-600">You aren't registered with any shop yet. <Link to={ROUTES.JOIN_COURIER} className="font-bold text-emerald-700 underline">Join with a code</Link></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="text-2xl font-black text-slate-900">My deliveries</h1>
      <p className="mt-1 text-xs text-slate-500">You work for: {d.shops.map((s) => s.name).join(", ")}. Payment is agreed with each shop directly. Never ask the buyer for their PIN before they have received and checked the item.</p>
      {d.jobs.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">No deliveries assigned right now.</p> : (
        <ul className="mt-4 space-y-3">{d.jobs.map((j) => (
          <li key={j.orderNumber} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase text-slate-400">{j.shop}</p><p className="font-mono text-sm font-bold">#{j.orderNumber}</p></div>
              {j.scheduledFor && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-800">For {when(j.scheduledFor)}</span>}</div>
            <ul className="text-xs text-slate-700">{j.items.map((i, n) => <li key={n}>{i.quantity} × {i.name}</li>)}</ul>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><p className="font-bold text-slate-900">Deliver to {j.to.name}</p><p>{j.to.subCounty}, {j.to.county}</p>{j.to.notes && <p className="mt-1 italic">{j.to.notes}</p>}</div>
            {j.feeNote && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">Note from the shop: {j.feeNote}</p>}
            <div className="grid grid-cols-2 gap-2"><a href={tel(j.to.phone)} className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 text-xs font-bold text-white">📞 Call buyer</a><a href={map(j.to)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-700">📍 Open map</a></div>
          </li>))}</ul>)}
      <div className="mt-6 space-y-1 text-[11px] text-slate-500">{d.shops.map((s) => <p key={s.memberId}>{s.name} · {s.vehicleType.replace("_", " ")}{s.plate ? ` · ${s.plate}` : ""} · <button type="button" onClick={() => leave(s)} className="font-bold text-red-600 underline">Stop delivering for this shop</button></p>)}</div>
    </div>
  );
}
