import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";

const DAY = 24 * 3600 * 1000;
const RENEW_WINDOW_DAYS = 7; // must match RENEW_WINDOW_DAYS in the backend plans config
const LEVELS = [[1, 25], [2, 15], [3, 9], [4, 6]]; // must match LEVELS in the backend plans config

const MESSAGES = {
  INSUFFICIENT_FUNDS: "Your wallet balance is too low for this plan.",
  WALLET_FROZEN: "Your wallet is frozen. Please contact support.",
  PROFILE_INCOMPLETE: "Please complete your brand profile before activating.",
  NOT_DUE_YET: `You can renew in the last ${RENEW_WINDOW_DAYS} days before your membership ends.`,
  COMMUNITY_FULL: "The network under your sponsor is full right now. Please try again later.",
  ACCOUNT_NOT_ELIGIBLE: "This account can't be activated. Please contact support.",
  NOT_A_NETWORK_ACCOUNT: "Only marketer accounts have a membership.",
  TOO_MANY_REQUESTS: "You're going too fast. Please wait a minute and try again.",
  PAYMENT_ALREADY_RECORDED: "That payment was already recorded. Refreshing your status.",
  NETWORK_ERROR: "Couldn't confirm the payment. Check your wallet balance before trying again: if it dropped, your payment went through.",
};
const FIELD_LABELS = { brandName: "brand name", brandCategory: "brand category", phoneNumber: "phone number", address: "address", county: "county" };

function errInfo(e) {
  if (!e.response) return { code: "NETWORK_ERROR" };
  const d = e.response.data || {};
  return { code: d.error || "REQUEST_FAILED", required: d.required, currentBalance: d.currentBalance, missing: d.missing };
}

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;
const fmtDate = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

export default function MembershipPage() {
  const { auth, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [me, setMe] = useState(null);
  const [balance, setBalance] = useState(0);
  const [activity, setActivity] = useState(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const keyRef = useRef(null); // one Idempotency-Key per payment attempt, kept across retries

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const [p, m, w] = await Promise.all([apiClient.get("/membership/plans"), apiClient.get("/membership/me"), apiClient.get("/wallet/my-balance")]);
      setPlans(p.data.plans || []);
      setMe(m.data);
      setBalance(w.data.balance || 0);
      setSelected((prev) => prev || m.data.plan || p.data.plans?.[0]?.key || "");
      if (m.data.status === "active") apiClient.get("/membership/activity").then((r) => setActivity(r.data)).catch(() => setActivity(null));
    } catch (e) {
      console.error("Membership load failed:", e);
      setLoadError(true);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { keyRef.current = null; }, [selected]); // a different plan is a different payment

  const pay = async () => {
    const plan = plans.find((p) => p.key === selected);
    if (paying || !plan) return;
    setConfirming(false); setError(null); setPaying(true);
    if (!keyRef.current) keyRef.current = crypto.randomUUID().replace(/-/g, "");
    try {
      await apiClient.post("/membership/pay", { plan: plan.key }, { headers: { "Idempotency-Key": keyRef.current } });
      keyRef.current = null;
      setDone(true);
      await refreshProfile(); // updates auth.destination without a reload
      await load();
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (e) {
      const info = errInfo(e);
      if (info.code !== "NETWORK_ERROR") keyRef.current = null; // a definite answer: the next try is a new payment
      setError(info);
    } finally { setPaying(false); }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (loadError || !me) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mb-3 text-sm font-semibold text-slate-600">Couldn't load your membership.</p>
        <button type="button" onClick={load} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white">Try again</button>
      </div>
    );
  }

  const expires = me.expiresAt ? new Date(me.expiresAt) : null;
  const running = me.status === "active" && expires && expires > Date.now();
  const daysLeft = expires ? Math.ceil((expires - Date.now()) / DAY) : null;
  const tooEarly = running && daysLeft > RENEW_WINDOW_DAYS;
  const plan = plans.find((p) => p.key === selected);
  const short = plan ? balance < plan.fee : false;
  const first = me.status === "pending";
  const action = first ? "Activate" : "Renew";
  const canPay = !paying && !!plan && !tooEarly && !short;
  const statusLabel = first ? "Not activated" : running ? "Active" : "Expired";

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-4 pb-44 pt-5 sm:px-6 lg:pb-10">
      <header>
        <h1 className="text-2xl font-black tracking-tight text-slate-900">Membership</h1>
        <p className="text-xs text-slate-500">Keeps your shop live and your network earnings on. Billed every {plans[0]?.days || 30} days from your wallet.</p>
      </header>

      {/* Status */}
      <section className="flex items-center justify-between gap-4 rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-600 p-5 text-white shadow-lg">
        <div className="min-w-0">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${running ? "bg-white text-emerald-800" : "bg-amber-300 text-amber-950"}`}>{statusLabel}</span>
          <p className="mt-3 text-sm font-bold leading-snug">
            {running ? `Valid until ${fmtDate(expires)}` : first ? "Choose a plan to open your shop." : `Expired on ${fmtDate(expires)}`}
          </p>
          {running && <p className="text-xs text-emerald-100">{daysLeft} day{daysLeft === 1 ? "" : "s"} left</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-bold uppercase text-emerald-100">Wallet</p>
          <p className="text-xl font-black">{fmt(balance)}</p>
          <Link to={ROUTES.WALLET} className="text-[11px] font-bold underline">Top up</Link>
        </div>
      </section>

      {done && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
          <span>🎉 Payment received. Your membership is up to date.</span>
          <button type="button" onClick={() => navigate(ROUTES.MEMBER_DASHBOARD)} className="min-h-10 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white">Go to my shop</button>
        </div>
      )}

      {/* Plans */}
      <section aria-labelledby="plans-h">
        <h2 id="plans-h" className="mb-2 text-sm font-black text-slate-800">Choose your plan</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Membership plan">
          {plans.map((p) => (
            <label key={p.key} className={`relative cursor-pointer rounded-2xl border p-4 transition ${selected === p.key ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-200" : "border-slate-200 bg-white hover:border-emerald-300"}`}>
              <input type="radio" name="plan" className="sr-only" checked={selected === p.key} onChange={() => setSelected(p.key)} />
              <p className="text-xs font-bold text-slate-500">{p.name}</p>
              <p className="mt-1 text-xl font-black text-slate-900">{fmt(p.fee)}</p>
              <p className="text-[11px] text-slate-400">every {p.days} days</p>
              {me.plan === p.key && running && <span className="absolute right-3 top-3 rounded-full bg-emerald-700 px-2 py-0.5 text-[9px] font-black uppercase text-white">Current</span>}
            </label>
          ))}
        </div>
      </section>

      {/* What you get */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-black text-slate-800">What membership gives you</h2>
        <ul className="space-y-1.5 text-xs text-slate-600">
          <li>🏪 Your own shop page and inventory dashboard</li>
          <li>🔗 A 5% promoter bonus on sales through your share links</li>
          <li>🌐 Network commissions on membership payments, up to four levels</li>
          <li>🔒 Escrow-protected sales and end-to-end encrypted chat</li>
        </ul>
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          {LEVELS.map(([l, pct]) => <div key={l} className="rounded-xl bg-emerald-50 p-2"><p className="text-[10px] font-bold text-emerald-700">Level {l}</p><p className="text-base font-black text-emerald-900">{pct}%</p></div>)}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Commissions are paid only to active members who meet the monthly activity checks, and depend on your network's membership payments. Earnings are not guaranteed.</p>
      </section>

      {/* Messages */}
      {error && (
        <div role="alert" className="space-y-1 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          <p>{MESSAGES[error.code] || "Something went wrong. Please try again."}</p>
          {error.code === "INSUFFICIENT_FUNDS" && error.required != null && <p>You need {fmt(error.required - (error.currentBalance || 0))} more. <Link to={ROUTES.WALLET} className="font-bold underline">Top up your wallet</Link></p>}
          {error.code === "PROFILE_INCOMPLETE" && (
            <p>{error.missing?.length ? `Missing: ${error.missing.map((k) => FIELD_LABELS[k] || k).join(", ")}. ` : ""}<Link to={ROUTES.MY_PROFILE} className="font-bold underline">Complete your profile</Link></p>
          )}
        </div>
      )}
      {tooEarly && <p className="text-xs text-slate-500">Renewal opens in {daysLeft - RENEW_WINDOW_DAYS} day{daysLeft - RENEW_WINDOW_DAYS === 1 ? "" : "s"}.</p>}
      {short && !tooEarly && plan && <p className="text-xs font-semibold text-amber-700">Your wallet is {fmt(plan.fee - balance)} short. <Link to={ROUTES.WALLET} className="font-bold underline">Top up</Link></p>}

      <button type="button" onClick={() => setConfirming(true)} disabled={!canPay}
        className="hidden min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:opacity-40 lg:flex">
        {paying ? "Processing…" : plan ? `${action} for ${fmt(plan.fee)}` : "Choose a plan"}
      </button>

      {/* Activity */}
      {activity && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-slate-800">Commission eligibility</h2>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${activity.eligible ? "bg-emerald-700 text-white" : "bg-amber-100 text-amber-800"}`}>{activity.eligible ? "Eligible" : "Not yet"}</span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            Pass {activity.passMark} of {activity.checks.length} checks in the last {activity.windowDays} days to receive network commissions
            {activity.inGrace ? ". You're in your welcome period, so you're eligible for now" : ""}. You've passed {activity.score}.
          </p>
          <ul className="space-y-3">
            {activity.checks.map((c) => {
              const pct = Math.min(100, Math.round((c.value / Math.max(1, c.target)) * 100));
              return (
                <li key={c.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className={c.passed ? "font-bold text-slate-800" : "text-slate-600"}>{c.passed ? "✓" : "○"} {c.label}</span>
                    <span className={`font-bold ${c.passed ? "text-emerald-700" : "text-slate-400"}`}>{c.value} / {c.target}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.passed ? "bg-emerald-600" : "bg-slate-300"}`} style={{ width: `${pct}%` }} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Sticky pay bar: phones and tablets, above the bottom tab bar */}
      <div className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden" style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{plan?.name || "Plan"}</p><p className="truncate text-lg font-black text-emerald-800">{plan ? fmt(plan.fee) : "—"}</p></div>
          <button type="button" onClick={() => setConfirming(true)} disabled={!canPay} className="ml-auto min-h-12 flex-1 rounded-xl bg-emerald-700 px-6 text-sm font-black text-white hover:bg-emerald-800 disabled:bg-slate-300 sm:flex-none sm:px-10">
            {paying ? "Processing…" : short ? "Top up to pay" : tooEarly ? "Not due yet" : action}
          </button>
        </div>
      </div>

      {/* Confirmation */}
      {confirming && plan && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm payment">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-900">{first ? "Activate your membership" : "Renew your membership"}</h3>
            <p className="text-sm text-slate-600">
              Pay <b>{fmt(plan.fee)}</b> from your wallet for <b>{plan.name}</b> ({plan.days} days).
              {first ? " Your shop goes live and you're placed in the network." : ` Your membership extends to ${fmtDate(new Date((expires && running ? expires.getTime() : Date.now()) + plan.days * DAY))}.`}
            </p>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-slate-500">Membership fees aren't refundable once paid. Your wallet after payment: {fmt(balance - plan.fee)}.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">Cancel</button>
              <button type="button" onClick={pay} className="min-h-11 flex-1 rounded-xl bg-emerald-700 text-sm font-black text-white">Pay {fmt(plan.fee)}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
