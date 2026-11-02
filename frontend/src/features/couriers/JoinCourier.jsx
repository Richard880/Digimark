import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = { INVALID_CODE: "That code isn't valid, or it has expired.", INVALID_PLATE: "Enter the plate like KMFA 123A.", PHOTO_REQUIRED: "Add a profile photo first: buyers need to see who is coming.", ALREADY_COURIER: "You already deliver for that shop.", TOO_MANY_REQUESTS: "Too many tries. Wait a minute." };

export default function JoinCourier() {
  const navigate = useNavigate();
  const [f, setF] = useState({ code: "", vehicleType: "motorcycle", plate: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const motor = ["motorcycle", "car", "van"].includes(f.vehicleType);
  const submit = async (e) => {
    e.preventDefault(); setError("");
    if (f.code.replace(/[^A-Za-z0-9]/g, "").length !== 10) return setError("The code has 10 letters and numbers.");
    setBusy(true);
    try { await apiClient.post("/couriers/join", f); try { localStorage.setItem("sokodigi_courier", "1"); } catch { /* optional */ } navigate(ROUTES.COURIER_JOBS, { replace: true }); }
    catch (x) { setError(x.response ? ERR[x.response.data?.error] || "Couldn't join. Please try again." : "Couldn't reach Sokodigi."); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center"><p className="text-4xl" aria-hidden="true">🛵</p><h1 className="mt-2 text-xl font-black text-slate-900">Join as a courier</h1>
          <p className="mt-1 text-sm text-slate-600">Enter the code the shop owner gave you. Buyers will see your profile photo, vehicle and number plate.</p></div>
        <input className={`${field} text-center font-mono text-lg tracking-widest`} placeholder="XXXXX-XXXXX" aria-label="Invite code" autoCapitalize="characters" autoComplete="off" maxLength={11} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
        <select className={field} aria-label="Vehicle" value={f.vehicleType} onChange={(e) => setF({ ...f, vehicleType: e.target.value })}>
          <option value="motorcycle">Motorcycle</option><option value="car">Car</option><option value="van">Van</option><option value="bicycle">Bicycle</option><option value="on_foot">On foot</option></select>
        {motor && <input className={field} placeholder="Number plate, e.g. KMFA 123A" aria-label="Number plate" maxLength={10} value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value.toUpperCase() })} />}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error} {error.includes("photo") && <Link to={ROUTES.MY_PROFILE} className="underline">Open profile</Link>}</p>}
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-50">{busy ? "Joining…" : "Join"}</button>
      </form>
    </div>
  );
}
