import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

const when = (d) => (d ? new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const tel = (p) => `tel:${String(p).startsWith("+") ? p : `+${p}`}`;
const map = (t) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.subCounty}, ${t.county}, Kenya`)}`;
const ERR = {
  INVALID_RELEASE_PIN: "That PIN is wrong. Ask the buyer to check it.", TOO_MANY_ATTEMPTS: "Too many wrong tries. Wait 15 minutes.", ALREADY_FULFILLED: "This order is already completed.",
  INVALID_PIN_FORMAT: "The PIN has 6 digits.", ORDER_NOT_DELIVERABLE: "This order can't be completed right now.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
};

function PinBox({ job, onDone }) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(pin)) return setErr(ERR.INVALID_PIN_FORMAT);
    setBusy(true); setErr("");
    try { await apiClient.patch(`/orders/${encodeURIComponent(job.orderNumber)}/fulfill-handshake`, { pin }); onDone(job.orderNumber); }
    catch (x) { setErr(x.response ? ERR[x.response.data?.error] || "Couldn't confirm. Please try again." : "Couldn't reach Sokodigi."); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-[11px] font-bold text-emerald-900">After the buyer has received and checked the item, enter the 6-digit PIN they give you. This releases the payment to the shop.</p>
      <div className="flex gap-2">
        <input inputMode="numeric" maxLength={6} placeholder="Buyer's PIN" aria-label="Buyer's PIN" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-center font-mono text-sm tracking-[0.3em]" />
        <button type="submit" disabled={busy || pin.length !== 6} className="min-h-11 shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-50">{busy ? "…" : "Confirm delivery"}</button>
      </div>
      {err && <p role="alert" className="text-xs font-bold text-red-700">{err}</p>}
    </form>
  );
}

export default function CourierJobs() {
  const [d, setD] = useState(null);
  const [state, setState] = useState("loading");
  const [tripFor, setTripFor] = useState(null);
  const [tripMsg, setTripMsg] = useState(null);
  const [done, setDone] = useState("");

  const load = useCallback(async () => {
    try { const { data } = await apiClient.get("/couriers/jobs"); setD(data); setState("ready"); if (!data.shops.length) { try { localStorage.removeItem("sokodigi_courier"); } catch { /* ignore */ } } }
    catch { setState("error"); }
  }, []);
  useEffect(() => { load(); const t = setInterval(() => document.visibilityState === "visible" && !tripFor && load(), 60000); return () => clearInterval(t); }, [load, tripFor]);

  // Share the phone's location while a trip is on. It only works while this page is open and the screen is on.
  useEffect(() => {
    if (!tripFor) return undefined;
    if (!navigator.geolocation) { setTripMsg({ ok: false, t: "This phone can't share its location." }); setTripFor(null); return undefined; }
    let last = 0, lock = null, dead = false;
    const wake = async () => { try { lock?.release?.().catch(() => {}); lock = await navigator.wakeLock?.request("screen"); } catch { /* optional */ } };
    wake();
    const onVis = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", onVis);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - last < 15000) return;
        last = now;
        apiClient.post("/tracking/trips/ping", { orderNumber: tripFor, lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy || 0) })
          .then(() => !dead && setTripMsg({ ok: true, t: `Sharing your location. Last sent ${new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. Keep this page open and the screen on.` }))
          .catch((e) => { if (!dead && e.response && [404, 409].includes(e.response.status)) { setTripFor(null); setTripMsg({ ok: false, t: "This trip has ended." }); } });
      },
      (err) => { if (err.code === 1) { setTripMsg({ ok: false, t: "Location is blocked. Allow location for Sokodigi in your browser settings, then start again." }); setTripFor(null); } },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    );
    return () => { dead = true; navigator.geolocation.clearWatch(id); document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch(() => {}); };
  }, [tripFor]);

  const start = async (n) => {
    setTripMsg(null);
    try { await apiClient.post("/tracking/trips/start", { orderNumber: n }); setTripFor(n); setTripMsg({ ok: true, t: "Starting… the buyer has been told you're on your way." }); }
    catch { setTripMsg({ ok: false, t: "Couldn't start the trip. The order must be assigned to you and on its way." }); }
  };
  const stop = async () => { const n = tripFor; setTripFor(null); setTripMsg(null); try { await apiClient.post("/tracking/trips/end", { orderNumber: n }); } catch { /* the trip expires on its own */ } };
  const delivered = (n) => { if (tripFor === n) stop(); setDone(`Order #${n} confirmed. The payment was released.`); load(); };
  const leave = async (s) => { if (window.confirm(`Stop delivering for ${s.name}?`)) { try { await apiClient.post(`/couriers/leave/${s.memberId}`); load(); } catch { /* try again */ } } };

  if (state === "loading") return <div className="mx-auto max-w-2xl px-4 py-6"><div className="h-32 animate-pulse rounded-2xl bg-slate-100" /></div>;
  if (state === "error") return <p className="py-20 text-center text-xs text-slate-600">Couldn't load your deliveries. <button type="button" onClick={load} className="font-bold text-emerald-700 underline">Try again</button></p>;
  if (!d.shops.length) return <div className="px-4 py-20 text-center text-sm text-slate-600">You aren't registered with any shop yet. <Link to={ROUTES.JOIN_COURIER} className="font-bold text-emerald-700 underline">Join with a code</Link></div>;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-5 sm:px-6">
      <h1 className="text-2xl font-black text-slate-900">My deliveries</h1>
      <p className="mt-1 text-xs text-slate-500">You work for: {d.shops.map((s) => s.name).join(", ")}. Payment is agreed with each shop directly. Never ask for the PIN before the buyer has the item.</p>
      {done && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900">{done}</p>}
      {tripMsg && <p role={tripMsg.ok ? "status" : "alert"} className={`mt-3 rounded-xl px-4 py-3 text-xs font-bold ${tripMsg.ok ? "bg-sky-50 text-sky-900" : "bg-red-50 text-red-700"}`}>{tripMsg.t}</p>}
      {d.jobs.length === 0 ? <p className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">No deliveries assigned right now.</p> : (
        <ul className="mt-4 space-y-3">{d.jobs.map((j) => (
          <li key={j.orderNumber} className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><div><p className="text-[10px] font-black uppercase text-slate-400">{j.shop}</p><p className="font-mono text-sm font-bold">#{j.orderNumber}</p></div>
              {j.scheduledFor && <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[10px] font-black text-sky-800">For {when(j.scheduledFor)}</span>}</div>
            <ul className="text-xs text-slate-700">{j.items.map((i, n) => <li key={n}>{i.quantity} × {i.name}</li>)}</ul>
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><p className="font-bold text-slate-900">Deliver to {j.to.name}</p><p>{j.to.subCounty}, {j.to.county}</p>{j.to.notes && <p className="mt-1 italic">{j.to.notes}</p>}</div>
            {j.feeNote && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900">Note from the shop: {j.feeNote}</p>}
            <div className="grid grid-cols-2 gap-2"><a href={tel(j.to.phone)} className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 text-xs font-bold text-white">📞 Call buyer</a><a href={map(j.to)} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-xs font-bold text-slate-700">📍 Open map</a></div>
            {tripFor === j.orderNumber
              ? <button type="button" onClick={stop} className="min-h-11 w-full rounded-xl bg-red-600 text-xs font-bold text-white">■ Stop sharing location</button>
              : <button type="button" onClick={() => start(j.orderNumber)} className="min-h-11 w-full rounded-xl bg-sky-700 text-xs font-bold text-white">▶ Start trip (share live location)</button>}
            <PinBox job={j} onDone={delivered} />
          </li>))}</ul>)}
      <div className="mt-6 space-y-1 text-[11px] text-slate-500">{d.shops.map((s) => <p key={s.memberId}>{s.name} · {s.vehicleType.replace("_", " ")}{s.plate ? ` · ${s.plate}` : ""} · <button type="button" onClick={() => leave(s)} className="font-bold text-red-600 underline">Stop delivering for this shop</button></p>)}</div>
    </div>
  );
}
