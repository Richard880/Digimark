import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";
import { field, errMsg } from "./ui";

export default function JoinShop() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    if (code.replace(/[^A-Za-z0-9]/g, "").length !== 10) return setError("The code has 10 letters and numbers.");
    setBusy(true); setError("");
    try { await apiClient.post("/shop/staff/join", { code }); try { localStorage.setItem("sokodigi_staff", "1"); } catch { /* optional */ } navigate(ROUTES.MEMBER_DASHBOARD, { replace: true }); }
    catch (x) { setError(errMsg(x)); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center"><p className="text-4xl" aria-hidden="true">🏪</p><h1 className="mt-2 text-xl font-black text-slate-900">Join a shop</h1>
          <p className="mt-1 text-sm text-slate-600">Enter the invite code the shop owner gave you. You'll be able to work in their shop with the access they chose.</p></div>
        <input className={`${field} text-center font-mono text-lg tracking-widest`} placeholder="XXXXX-XXXXX" aria-label="Invite code" autoCapitalize="characters" autoComplete="off" maxLength={11} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white disabled:opacity-50">{busy ? "Joining…" : "Join shop"}</button>
        <p className="text-center text-[11px] text-slate-500">Shop owners and marketers can't join as staff. Use a separate account.</p>
      </form>
    </div>
  );
}
