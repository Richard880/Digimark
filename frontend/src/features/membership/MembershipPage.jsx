import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";

const DAY = 24 * 3600 * 1000;
const RENEW_WINDOW_DAYS = 7; // must match RENEW_WINDOW_DAYS in the backend plans config

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
  NETWORK_ERROR: "Couldn't reach Sokodigi. Your wallet was not charged twice: you can safely try again.",
};

const FIELD_LABELS = { brandName: "brand name", brandCategory: "brand category", phoneNumber: "phone number", address: "address", county: "county" };

function errInfo(e) {
  if (!e.response) return { code: "NETWORK_ERROR" };
  const d = e.response.data || {};
  return { code: d.error || "REQUEST_FAILED", required: d.required, currentBalance: d.currentBalance, missing: d.missing };
}

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString()}`;
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
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const keyRef = useRef(null); // one Idempotency-Key per payment attempt, kept across retries

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [p, m, w] = await Promise.all([
        apiClient.get("/membership/plans"),
        apiClient.get("/membership/me"),
        apiClient.get("/wallet/my-balance"),
      ]);
      setPlans(p.data.plans || []);
      setMe(m.data);
      setBalance(w.data.balance || 0);
      setSelected((prev) => prev || m.data.plan || p.data.plans?.[0]?.key || "");
      if (m.data.status === "active") {
        apiClient.get("/membership/activity").then((r) => setActivity(r.data)).catch(() => setActivity(null));
      }
    } catch (e) {
      console.error("Membership load failed:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { keyRef.current = null; }, [selected]); // a different plan is a different payment

  const pay = async () => {
    const plan = plans.find((p) => p.key === selected);
    if (paying || !plan) return;
    setError(null);
    setPaying(true);
    if (!keyRef.current) keyRef.current = crypto.randomUUID().replace(/-/g, "");
    try {
      await apiClient.post("/membership/pay", { plan: plan.key }, { headers: { "Idempotency-Key": keyRef.current } });
      keyRef.current = null;
      setDone(true);
      await refreshProfile(); // updates auth.destination without a page reload
      await load();
    } catch (e) {
      const info = errInfo(e);
      if (info.code !== "NETWORK_ERROR") keyRef.current = null; // a definite answer: the next try is a new payment
      setError(info);
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (loadError || !me) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <p className="text-sm font-semibold text-slate-600 mb-3">Couldn't load your membership.</p>
        <button type="button" onClick={load} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">Try again</button>
      </div>
    );
  }

  const expires = me.expiresAt ? new Date(me.expiresAt) : null;
  const running = me.status === "active" && expires && expires > Date.now();
  const daysLeft = expires ? Math.ceil((expires - Date.now()) / DAY) : null;
  const tooEarly = running && daysLeft > RENEW_WINDOW_DAYS;
  const plan = plans.find((p) => p.key === selected);
  const short = plan ? balance < plan.fee : false;
  const status = me.status === "pending" ? "Not activated" : running ? "Active" : "Expired";
  const action = me.status === "pending" ? "Activate" : "Renew";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <header>
        <h1 className="text-xl font-bold text-slate-800">Your Membership</h1>
        <p className="text-xs text-slate-500">Billed every {plans[0]?.days || 30} days from your wallet.</p>
      </header>

      {/* Status */}
      <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 flex items-center justify-between">
        <div>
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${running ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800"}`}>{status}</span>
          <p className="text-sm font-semibold text-slate-700 mt-2">
            {running ? `Valid until ${fmtDate(expires)} (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)` : me.status === "pending" ? "Choose a plan to open your shop." : `Expired on ${fmtDate(expires)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase font-bold text-slate-400">Wallet</p>
          <p className="text-base font-bold text-emerald-700">{fmt(balance)}</p>
          <Link to={ROUTES.WALLET} className="text-[11px] underline text-emerald-700">Top up</Link>
        </div>
      </section>

      {done && (
        <div role="status" className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 flex items-center justify-between">
          <span>Payment received. Your membership is up to date.</span>
          <button type="button" onClick={() => navigate(ROUTES.MEMBER_DASHBOARD)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer">Go to my shop</button>
        </div>
      )}

      {/* Plans */}
      <section>
        <h2 className="text-sm font-bold text-slate-700 mb-2">Choose a plan</h2>
        <div className="grid grid-cols-2 gap-3">
          {plans.map((p) => (
            <label key={p.key} className={`cursor-pointer rounded-2xl border p-4 ${selected === p.key ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white"}`}>
              <input type="radio" name="plan" className="sr-only" checked={selected === p.key} onChange={() => setSelected(p.key)} />
              <p className="text-xs font-bold text-slate-500">{p.name}</p>
              <p className="text-lg font-bold text-slate-800">{fmt(p.fee)}</p>
              <p className="text-[11px] text-slate-400">per {p.days} days</p>
              {me.plan === p.key && running && <p className="text-[10px] font-bold text-emerald-700 mt-1">Current plan</p>}
            </label>
          ))}
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs font-medium text-red-700 space-y-1">
          <p>{MESSAGES[error.code] || "Something went wrong. Please try again."}</p>
          {error.code === "INSUFFICIENT_FUNDS" && error.required != null && (
            <p>You need {fmt(error.required - (error.currentBalance || 0))} more. <Link to={ROUTES.WALLET} className="underline font-bold">Top up your wallet</Link></p>
          )}
          {error.code === "PROFILE_INCOMPLETE" && error.missing?.length > 0 && (
            <p>Missing: {error.missing.map((k) => FIELD_LABELS[k] || k).join(", ")}.</p>
          )}
        </div>
      )}

      {tooEarly && (
        <p className="text-xs text-slate-500">Renewal opens in {daysLeft - RENEW_WINDOW_DAYS} day{daysLeft - RENEW_WINDOW_DAYS === 1 ? "" : "s"}.</p>
      )}
      {short && !tooEarly && plan && (
        <p className="text-xs text-amber-700">
          Your wallet is {fmt(plan.fee - balance)} short. <Link to={ROUTES.WALLET} className="underline font-bold">Top up</Link>
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={paying || !plan || tooEarly || short}
        className="w-full py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
      >
        {paying ? "Processing…" : plan ? `${action} for ${fmt(plan.fee)}` : "Choose a plan"}
      </button>

      {/* Activity checklist (active members) */}
      {activity && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-700">Commission eligibility</h2>
            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${activity.eligible ? "bg-emerald-600 text-white" : "bg-amber-100 text-amber-800"}`}>
              {activity.eligible ? "Eligible" : "Not yet eligible"}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Pass {activity.passMark} of {activity.checks.length} checks in the last {activity.windowDays} days to receive network commissions
            {activity.inGrace ? " (you're in your welcome period, so you're eligible for now)." : "."} You've passed {activity.score}.
          </p>
          <ul className="space-y-2">
            {activity.checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between text-xs">
                <span className={c.passed ? "text-slate-700" : "text-slate-500"}>{c.passed ? "✓" : "○"} {c.label}</span>
                <span className={`font-semibold ${c.passed ? "text-emerald-700" : "text-slate-400"}`}>{c.value} / {c.target}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
