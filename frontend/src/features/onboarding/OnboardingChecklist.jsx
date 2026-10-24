import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import authService from "../auth/services/authService";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

// The wording lives here; the server only says which steps are done
const COPY = {
  email: { title: "Verify your email", hint: "Secures your account and your payouts.", action: "verify" },
  photo: { title: "Add a profile photo", hint: "Sellers and buyers trust people with a face.", to: ROUTES.MY_PROFILE, cta: "Add photo" },
  topup: { title: "Top up your wallet", hint: "Pay with M-Pesa, then check out in one tap.", to: ROUTES.WALLET, cta: "Top up" },
  firstOrder: { title: "Place your first order", hint: "Your money stays in escrow until your item arrives.", to: ROUTES.MARKETPLACE, cta: "Browse" },
  brand: { title: "Complete your brand profile", hint: "This is your public shop page.", to: ROUTES.MY_PROFILE, cta: "Edit profile" },
  membership: { title: "Activate your membership", hint: "Goes live with your shop and your network earnings.", to: ROUTES.MEMBERSHIP, cta: "Activate" },
  firstProduct: { title: "Add your first product", hint: "Customers can't buy from an empty shop.", to: ROUTES.MEMBER_DASHBOARD, cta: "Add product" },
  invite: { title: "Invite your first member", hint: "Share your invite link and grow your team.", to: ROUTES.MY_TEAM, cta: "Get my link" },
  chat: { title: "Turn on secure chat", hint: "End-to-end encrypted messages with buyers and sellers.", to: ROUTES.MESSAGES, cta: "Turn on" },
};

export default function OnboardingChecklist({ compact = false }) {
  const { auth } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      const { data: d } = await apiClient.get("/onboarding");
      setData(d);
    } catch {
      /* the checklist is optional: stay hidden if it can't load */
    }
  }, []);

  useEffect(() => {
    if (!auth.authenticated) return undefined;
    load();
    const onVisible = () => document.visibilityState === "visible" && load(); // refresh after doing a step elsewhere
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [auth.authenticated, load]);

  if (!auth.authenticated || !data || data.dismissed || !data.total || data.done >= data.total) return null;

  const next = data.steps.find((s) => !s.done)?.key;
  const pct = Math.round((data.done / data.total) * 100);

  const sendLink = async () => {
    setBusy(true); setNote("");
    try { await authService.resendVerification(); setNote("Verification email sent. Open it, tap the link, then press “I've verified”."); }
    catch { setNote("Couldn't send the email. Please try again in a minute."); } finally { setBusy(false); }
  };
  const checkVerified = async () => {
    setBusy(true); setNote("");
    try {
      const ok = await authService.updateEmailVerificationStatus();
      if (!ok) setNote("We can't see your verification yet. Tap the link in the email first.");
      await load();
    } catch { setNote("Couldn't check right now. Please try again."); } finally { setBusy(false); }
  };
  const dismiss = async () => {
    setData((d) => ({ ...d, dismissed: true })); // hide at once
    try { await apiClient.post("/onboarding/dismiss"); } catch { /* it just reappears next visit */ }
  };

  return (
    <section aria-labelledby="onboarding-h" className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="onboarding-h" className="text-sm font-black text-slate-900">{data.role === "marketer" ? "Set up your shop" : "Get started"}</h2>
          <p className="text-[11px] text-slate-500">{data.done} of {data.total} done</p>
        </div>
        <button type="button" onClick={dismiss} className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-slate-100">Hide</button>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
        <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>

      <ul className={`mt-3 ${compact ? "grid gap-1.5 sm:grid-cols-2" : "space-y-1.5"}`}>
        {data.steps.map((s) => {
          const c = COPY[s.key];
          if (!c) return null;
          const isNext = s.key === next;
          return (
            <li key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${s.done ? "opacity-60" : isNext ? "bg-white ring-1 ring-emerald-300" : "bg-white/70"}`}>
              <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${s.done ? "bg-emerald-600 text-white" : "border-2 border-slate-300 text-transparent"}`}>✓</span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-bold ${s.done ? "text-slate-500 line-through" : "text-slate-900"}`}>{c.title}</p>
                {!s.done && !compact && <p className="text-[11px] text-slate-500">{c.hint}</p>}
              </div>
              {!s.done && c.to && (
                <Link to={c.to} className={`shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold ${isNext ? "bg-emerald-700 text-white hover:bg-emerald-800" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{c.cta}</Link>
              )}
              {!s.done && c.action === "verify" && (
                <span className="flex shrink-0 gap-1.5">
                  <button type="button" disabled={busy} onClick={sendLink} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">Send link</button>
                  <button type="button" disabled={busy} onClick={checkVerified} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50">I've verified</button>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {note && <p role="status" className="mt-3 rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">{note}</p>}
    </section>
  );
}
