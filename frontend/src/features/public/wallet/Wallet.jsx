import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES from "../../../constants/routes";

const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;
const MIN_TOPUP = 10, MAX_TOPUP = 150000;
const MIN_WITHDRAW = 50, MAX_WITHDRAW = 150000;
const POLL_MS = 5000, POLL_MAX = 24; // about 2 minutes
const QUICK = [100, 500, 1000, 2000];

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;
const fmtDate = (d) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const MESSAGES = {
  INVALID_AMOUNT: "Please enter a valid whole-number amount.",
  INVALID_PHONE: "Enter a valid Safaricom number, e.g. 0712345678.",
  WALLET_FROZEN: "Your wallet is frozen. Please contact support.",
  INSUFFICIENT_FUNDS: "Your wallet balance is too low for that withdrawal.",
  PAYOUT_PHONE_NOT_SET: "Add a phone number to your profile before withdrawing.",
  TOPUP_ALREADY_IN_PROGRESS: "A top-up is already in progress. Check your phone.",
  PAYMENT_PROVIDER_REJECTED: "M-Pesa couldn't start the payment. Please try again.",
  TOO_MANY_REQUESTS: "You're going too fast. Please wait a minute and try again.",
  NETWORK_ERROR: "Couldn't reach Sokodigi. Check your connection and try again.",
  GENERIC: "Something went wrong. Please try again.",
  MPESA_NOT_CONFIGURED: "M-Pesa top-ups aren't available yet. Please check back soon.",
  PAYOUTS_NOT_CONFIGURED: "Withdrawals aren't available yet. Please check back soon.",
};

const TYPE = {
  deposit: ["📲", "M-Pesa top-up"],
  withdrawal: ["💸", "Withdrawal"],
  product_purchase: ["🛍️", "Purchase"],
  receive_transfer: ["⬇️", "Received"],
  send_transfer: ["⬆️", "Sent"],
  affiliate_commission: ["🤝", "Promoter bonus"],
  network_commission: ["🌐", "Network commission"],
  matrix_subscription: ["🎫", "Membership fee"],
  platform_revenue: ["🏦", "Platform revenue"],
  breakage: ["🏦", "Unclaimed commission"],
};

const WITHDRAWAL_STATUS = { PENDING_PAYOUT: "Sending", SUBMITTED: "Sent to M-Pesa", COMPLETED: "Paid", FAILED: "Failed, refunded", REVIEW: "Under review", 
AWAITING_APPROVAL: "Awaiting approval", };

function errText(err) {
  if (!err.response) return MESSAGES.NETWORK_ERROR;
  const d = err.response.data || {};
  if (d.error === "DAILY_LIMIT_EXCEEDED") return `Daily withdrawal limit reached. You can still withdraw ${fmt(d.remaining)} within the next 24 hours.`;
  return MESSAGES[d.error] || MESSAGES.GENERIC;
}

function Note({ note }) {
  if (!note) return null;
  const tone = note.type === "ok" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : note.type === "error" ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-slate-200 text-slate-700";
  return <p role={note.type === "error" ? "alert" : "status"} className={`mt-3 rounded-xl border px-3 py-2.5 text-xs font-semibold ${tone}`}>{note.text}</p>;
}

export default function Wallet() {
  const { auth } = useAuth();
  const profilePhone = auth.profile?.phoneNumber || ""; // stored as 2547XXXXXXXX

  const [wallet, setWallet] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [panel, setPanel] = useState("topup");
  const [filter, setFilter] = useState("all");

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpPhone, setTopUpPhone] = useState(profilePhone ? `0${profilePhone.slice(3)}` : "");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpNote, setTopUpNote] = useState(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState(null);
  const [confirmAmount, setConfirmAmount] = useState(0);

  const mounted = useRef(true);
  const timerRef = useRef(null);
  const withdrawKey = useRef(null); // one Idempotency-Key per withdrawal attempt, kept across retries

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimeout(timerRef.current); };
  }, []);

  const load = useCallback(async () => {
    try {
      const [w, wd] = await Promise.all([
        apiClient.get("/wallet/my-balance"),
        apiClient.get("/wallet/withdrawals").catch(() => ({ data: { withdrawals: [] } })),
      ]);
      if (!mounted.current) return;
      setWallet(w.data);
      setWithdrawals(wd.data.withdrawals || []);
      setLoadError(false);
    } catch (e) {
      console.error("Wallet load failed:", e);
      if (mounted.current) setLoadError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // After the STK push: ask the server every 5 seconds until the payment settles
  const waitForTopUp = useCallback(async (checkoutRequestId) => {
    for (let i = 0; i < POLL_MAX; i++) {
      await new Promise((resolve) => { timerRef.current = setTimeout(resolve, POLL_MS); });
      if (!mounted.current) return;
      try {
        const { data } = await apiClient.get(`/wallet/topup/${encodeURIComponent(checkoutRequestId)}/status`);
        if (data.status === "COMPLETED") { setTopUpNote({ type: "ok", text: `Top-up of ${fmt(data.amount)} received.` }); load(); return; }
        if (data.status === "FAILED") { setTopUpNote({ type: "error", text: "The payment was cancelled or failed. You were not charged." }); return; }
        if (data.status === "REVIEW") { setTopUpNote({ type: "info", text: "We're verifying your payment. It will appear in your wallet shortly." }); return; }
      } catch { /* a failed check just means we try again */ }
    }
    setTopUpNote({ type: "info", text: "Still waiting for M-Pesa. If you paid, it will appear here shortly." });
    load();
  }, [load]);

  const submitTopUp = async (e) => {
    e.preventDefault();
    if (topUpBusy) return;
    const amount = Number(topUpAmount);
    if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) return setTopUpNote({ type: "error", text: `Enter a whole amount between ${fmt(MIN_TOPUP)} and ${fmt(MAX_TOPUP)}.` });
    const phone = topUpPhone.replace(/[\s-]/g, "");
    if (!PHONE_RE.test(phone)) return setTopUpNote({ type: "error", text: MESSAGES.INVALID_PHONE });

    setTopUpBusy(true); setTopUpNote(null);
    try {
      const { data } = await apiClient.post("/wallet/mpesa-topup", { amount, phone });
      setTopUpAmount("");
      setTopUpNote({ type: "info", text: "Check your phone and enter your M-Pesa PIN to confirm." });
      await waitForTopUp(data.checkoutRequestId);
    } catch (err) {
      console.error("Top-up failed:", err);
      setTopUpNote({ type: "error", text: errText(err) });
    } finally { if (mounted.current) setTopUpBusy(false); }
  };

  const askWithdraw = (e) => {
    e.preventDefault();
    if (withdrawBusy) return;
    const amount = Number(withdrawAmount);
    if (!Number.isInteger(amount) || amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) return setWithdrawNote({ type: "error", text: `Enter a whole amount between ${fmt(MIN_WITHDRAW)} and ${fmt(MAX_WITHDRAW)}.` });
    if (amount > (wallet?.balance || 0)) return setWithdrawNote({ type: "error", text: MESSAGES.INSUFFICIENT_FUNDS });
    if (!profilePhone) return setWithdrawNote({ type: "error", text: MESSAGES.PAYOUT_PHONE_NOT_SET });
    setWithdrawNote(null);
    setConfirmAmount(amount);
  };

  const doWithdraw = async () => {
    const amount = confirmAmount;
    setConfirmAmount(0);
    setWithdrawBusy(true); setWithdrawNote(null);
    if (!withdrawKey.current) withdrawKey.current = crypto.randomUUID().replace(/-/g, "");
    try {
     const { data } = await apiClient.post("/wallet/withdraw", { amount }, { headers: { "Idempotency-Key": withdrawKey.current } });
        withdrawKey.current = null;
        setWithdrawAmount("");
        setWithdrawNote({
          type: "ok",
          text: data.withdrawal?.status === "AWAITING_APPROVAL"
            ? "Large withdrawals are checked by our team for your safety. Yours was received and is usually approved within a few hours."
            : "Withdrawal started. The money reaches your M-Pesa within a few minutes.",
        });
      await load();
    } catch (err) {
      console.error("Withdrawal failed:", err);
      if (err.response) withdrawKey.current = null; // a definite answer, so the next try is a new request
      setWithdrawNote({ type: "error", text: errText(err) });
    } finally { if (mounted.current) setWithdrawBusy(false); }
  };

  // Development only: fund the wallet without M-Pesa (the server refuses this in production)
  const addTestFunds = async () => {
    setTopUpNote(null);
    try {
      await apiClient.post("/wallet/dev-topup", { amount: 5000 });
      setTopUpNote({ type: "ok", text: "Added Ksh 5,000 of test funds." });
      await load();
    } catch (err) {
      setTopUpNote({ type: "error", text: err.response?.status === 404 ? "Test funds are switched off on the server (ALLOW_DEV_TOPUP)." : errText(err) });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <div className="h-40 animate-pulse rounded-3xl bg-slate-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (loadError || !wallet) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="mb-3 text-sm font-semibold text-slate-600">Couldn't load your wallet.</p>
        <button type="button" onClick={() => { setLoading(true); load(); }} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-bold text-white">Try again</button>
      </div>
    );
  }

  const frozen = !!wallet.isFrozen;
  const txs = (wallet.transactions || []).filter((t) => filter === "all" || (filter === "in" ? Number(t.amount) >= 0 : Number(t.amount) < 0));
  const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-50";
  const maskedPhone = profilePhone ? `${profilePhone.slice(0, 6)}***${profilePhone.slice(-3)}` : "";
  const seg = (active) => `flex-1 rounded-xl py-2.5 text-xs font-black transition ${active ? "bg-white text-emerald-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:pb-10">
      {/* Balance */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 to-emerald-600 p-6 text-white shadow-lg">
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">Available balance</p>
        <p className="mt-1 text-4xl font-black tracking-tight">{fmt(wallet.balance)}</p>
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/10 px-4 py-3 text-xs">
          <span className="text-emerald-50">🔒 Held in escrow</span>
          <span className="font-black">{fmt(wallet.escrowBalance)}</span>
        </div>
        <p className="mt-2 text-[11px] text-emerald-100/80">Escrow is released to sellers once you confirm delivery.</p>
      </section>

      {frozen && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">Your wallet is frozen. Top-ups and withdrawals are paused. Please contact support.</p>}

      {/* Actions */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex gap-1 rounded-2xl bg-slate-100 p-1" role="group" aria-label="Wallet actions">
          <button type="button" className={seg(panel === "topup")} aria-pressed={panel === "topup"} onClick={() => setPanel("topup")}>📲 Top up</button>
          <button type="button" className={seg(panel === "withdraw")} aria-pressed={panel === "withdraw"} onClick={() => setPanel("withdraw")}>💸 Withdraw</button>
        </div>

        {panel === "topup" ? (
          <form onSubmit={submitTopUp} className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {QUICK.map((q) => (
                <button key={q} type="button" onClick={() => setTopUpAmount(String(q))} disabled={topUpBusy || frozen}
                  className={`rounded-full border px-4 py-2 text-xs font-bold ${Number(topUpAmount) === q ? "border-emerald-700 bg-emerald-700 text-white" : "border-slate-200 text-slate-700 hover:bg-emerald-50"}`}>{fmt(q)}</button>
              ))}
            </div>
            <label className="block text-[11px] font-bold uppercase text-slate-500" htmlFor="topup-amount">Amount (KES)</label>
            <input id="topup-amount" type="number" inputMode="numeric" min={MIN_TOPUP} max={MAX_TOPUP} step="1" value={topUpAmount} onChange={(e) => setTopUpAmount(e.target.value)} disabled={topUpBusy || frozen} placeholder="e.g. 1000" className={field} />
            <label className="block text-[11px] font-bold uppercase text-slate-500" htmlFor="topup-phone">M-Pesa number</label>
            <input id="topup-phone" type="tel" inputMode="tel" autoComplete="tel" value={topUpPhone} onChange={(e) => setTopUpPhone(e.target.value)} disabled={topUpBusy || frozen} placeholder="0712345678" className={field} />
            <button type="submit" disabled={topUpBusy || frozen || !topUpAmount} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-40">
              {topUpBusy ? "Waiting for M-Pesa…" : `Top up${topUpAmount ? ` ${fmt(Number(topUpAmount))}` : ""}`}
            </button>
            <p className="text-center text-[11px] text-slate-500">You'll get an M-Pesa prompt on your phone. Enter your M-Pesa PIN to confirm.</p>
            <Note note={topUpNote} />
            {import.meta.env.DEV && (
              <button type="button" onClick={addTestFunds} className="w-full rounded-xl border border-dashed border-amber-400 py-2 text-[11px] font-bold text-amber-700">Dev only: add Ksh 5,000 test funds</button>
            )}
          </form>
        ) : (
          <form onSubmit={askWithdraw} className="mt-4 space-y-3">
            {profilePhone ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Money is sent to <b>{maskedPhone}</b>, the number on your account.</p>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">Add a phone number to your profile to withdraw.</p>
            )}
            <label className="block text-[11px] font-bold uppercase text-slate-500" htmlFor="wd-amount">Amount (KES)</label>
            <div className="flex gap-2">
              <input id="wd-amount" type="number" inputMode="numeric" min={MIN_WITHDRAW} max={MAX_WITHDRAW} step="1" value={withdrawAmount}
                onChange={(e) => { setWithdrawAmount(e.target.value); withdrawKey.current = null; }} disabled={withdrawBusy || frozen} placeholder="e.g. 500" className={field} />
              <button type="button" onClick={() => { setWithdrawAmount(String(Math.min(wallet.balance || 0, MAX_WITHDRAW))); withdrawKey.current = null; }} disabled={withdrawBusy || frozen}
                className="shrink-0 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">All</button>
            </div>
            <button type="submit" disabled={withdrawBusy || frozen || !withdrawAmount || !profilePhone} className="min-h-12 w-full rounded-xl bg-slate-900 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-40">
              {withdrawBusy ? "Processing…" : "Withdraw to M-Pesa"}
            </button>
            <Note note={withdrawNote} />
          </form>
        )}
      </section>

      {withdrawals.length > 0 && (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-black text-slate-800">Recent withdrawals</h2>
          <ul className="divide-y divide-slate-100">
            {withdrawals.map((w, i) => (
              <li key={`${w.createdAt}-${i}`} className="flex items-center justify-between gap-3 py-3 text-xs">
                <span className="font-bold text-slate-800">{fmt(w.amount)}</span>
                <span className="text-slate-400">{fmtDate(w.createdAt)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-600">{WITHDRAWAL_STATUS[w.status] || w.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* History */}
      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-slate-800">Transaction history</h2>
          <div className="flex gap-1" role="group" aria-label="Filter transactions">
            {[["all", "All"], ["in", "Money in"], ["out", "Money out"]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold ${filter === k ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-600"}`}>{l}</button>
            ))}
          </div>
        </div>

        {txs.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {txs.map((t) => {
              const amount = Number(t.amount) || 0;
              const credit = amount >= 0;
              const [icon, label] = TYPE[t.type] || ["💳", "Transaction"];
              return (
                <li key={t.transactionId || t._id} className="flex items-start gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg" aria-hidden="true">{icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{label}</p>
                    {t.description && <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">{t.description}</p>}
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{t.createdAt ? fmtDate(t.createdAt) : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-black ${credit ? "text-emerald-600" : "text-slate-900"}`}>{credit ? "+" : "−"}{fmt(Math.abs(amount))}</p>
                    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                      t.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : t.status === "ESCROW_HELD" ? "bg-amber-50 text-amber-700" : t.status === "FAILED" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.status === "COMPLETED" ? "Success" : String(t.status || "Pending").replace("_", " ")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400">
            {filter === "all" ? <>No transactions yet. <Link to={ROUTES.MARKETPLACE} className="font-bold text-emerald-700 underline">Go shopping</Link></> : "Nothing here."}
          </div>
        )}
      </section>

      {/* Withdrawal confirmation */}
      {confirmAmount > 0 && (
        <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 p-4 sm:items-center" role="dialog" aria-modal="true" aria-label="Confirm withdrawal">
          <div className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-black text-slate-900">Confirm withdrawal</h3>
            <p className="text-sm text-slate-600">Send <b>{fmt(confirmAmount)}</b> to M-Pesa <b>{maskedPhone}</b>?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmAmount(0)} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-sm font-bold text-slate-700">Cancel</button>
              <button type="button" onClick={doWithdraw} className="min-h-11 flex-1 rounded-xl bg-slate-900 text-sm font-black text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
