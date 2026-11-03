import { useEffect, useState } from "react";
import apiClient from "../../services/apiClient";

const ago = (d) => { const s = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 1000)); return s < 60 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

export default function TrackingCard({ orderNumber, sellerId }) {
  const [trips, setTrips] = useState([]);
  useEffect(() => {
    let live = true;
    const load = () => document.visibilityState === "visible" &&
      apiClient.get("/tracking/mine", { params: { orderNumber, sellerId } }).then(({ data }) => live && setTrips(data.trips)).catch(() => {});
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, [orderNumber, sellerId]);
  if (!trips.length) return null;
  return (
    <div className="space-y-2">
      {trips.map((t) => (
        <div key={t.orderNumber} className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Live delivery · #{t.orderNumber}</p>
          <p className="mt-0.5 font-bold text-slate-900">{t.courierName} is on the way</p>
          {t.waiting ? <p className="text-slate-600">Waiting for the first location…</p> : (
            <>
              <p className={t.stale ? "font-semibold text-amber-800" : "text-slate-600"}>{t.stale ? "Location paused (the courier's screen may be off). Last seen " : "Updated "}{ago(t.pingedAt)}</p>
              <a href={`https://www.google.com/maps?q=${t.lat},${t.lng}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-sky-700 px-4 font-bold text-white">📍 See where they are</a>
            </>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Only you can see this. It disappears when your order is delivered.</p>
        </div>
      ))}
    </div>
  );
}
