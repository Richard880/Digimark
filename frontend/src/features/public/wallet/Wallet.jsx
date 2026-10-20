import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES from "../../../constants/routes";

const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;
const MIN_TOPUP = 10;
const MAX_TOPUP = 150000;
const MIN_WITHDRAW = 50;
const MAX_WITHDRAW = 150000;
const POLL_MS = 5000;
const POLL_MAX = 24; // about 2 minutes

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString()}`;
const fmtDate = (d) =>
  new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

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

const TYPE_LABELS = {
  deposit: "M-Pesa top-up",
  withdrawal: "Withdrawal",
  product_purchase: "Purchase",
  receive_transfer: "Received",
  send_transfer: "Sent",
  affiliate_commission: "Promoter bonus",
  network_commission: "Network commission",
  matrix_subscription: "Membership fee",
};

const WITHDRAWAL_STATUS = {
  PENDING_PAYOUT: "Sending",
  SUBMITTED: "Sent to M-Pesa",
  COMPLETED: "Paid",
  FAILED: "Failed, refunded",
  REVIEW: "Under review",
};

function errText(err) {
  if (!err.response) return MESSAGES.NETWORK_ERROR;
  const d = err.response.data || {};
  if (d.error === "DAILY_LIMIT_EXCEEDED") {
    return `Daily withdrawal limit reached. You can still withdraw ${fmt(d.remaining)} within the next 24 hours.`;
  }
  return MESSAGES[d.error] || MESSAGES.GENERIC;
}

function Note({ note }) {
  if (!note) return null;
  const tone =
    note.type === "ok"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : note.type === "error"
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-slate-50 border-slate-200 text-slate-700";
  return (
    <p role={note.type === "error" ? "alert" : "status"} className={`mt-2 rounded-lg border px-3 py-2 text-[11px] font-semibold ${tone}`}>
      {note.text}
    </p>
  );
}

export default function Wallet() {
  const { auth } = useAuth();
  const profilePhone = auth.profile?.phoneNumber || ""; // stored as 2547XXXXXXXX

  const [wallet, setWallet] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpPhone, setTopUpPhone] = useState(profilePhone ? `0${profilePhone.slice(3)}` : "");
  const [topUpBusy, setTopUpBusy] = useState(false);
  const [topUpNote, setTopUpNote] = useState(null);

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawNote, setWithdrawNote] = useState(null);

  const mounted = useRef(true);
  const timerRef = useRef(null);
  const withdrawKey = useRef(null); // one Idempotency-Key per withdrawal attempt, kept across retries

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timerRef.current);
    };
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

  useEffect(() => {
    load();
  }, [load]);

  // After the STK push: ask the server every 5 seconds until the payment settles
  const waitForTopUp = useCallback(
    async (checkoutRequestId) => {
      for (let i = 0; i < POLL_MAX; i++) {
        await new Promise((resolve) => {
          timerRef.current = setTimeout(resolve, POLL_MS);
        });
        if (!mounted.current) return;
        try {
          const { data } = await apiClient.get(`/wallet/topup/${encodeURIComponent(checkoutRequestId)}/status`);
          if (data.status === "COMPLETED") {
            setTopUpNote({ type: "ok", text: `Top-up of ${fmt(data.amount)} received.` });
            load();
            return;
          }
          if (data.status === "FAILED") {
            setTopUpNote({ type: "error", text: "The payment was cancelled or failed. You were not charged." });
            return;
          }
          if (data.status === "REVIEW") {
            setTopUpNote({ type: "info", text: "We're verifying your payment. It will appear in your wallet shortly." });
            return;
          }
        } catch {
          /* a failed check just means we try again */
        }
      }
      setTopUpNote({ type: "info", text: "Still waiting for M-Pesa. If you paid, it will appear here shortly." });
      load();
    },
    [load]
  );

  const submitTopUp = async (e) => {
    e.preventDefault();
    if (topUpBusy) return;
    const amount = Number(topUpAmount);
    if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
      return setTopUpNote({ type: "error", text: `Enter a whole amount between ${fmt(MIN_TOPUP)} and ${fmt(MAX_TOPUP)}.` });
    }
    const phone = topUpPhone.replace(/[\s-]/g, "");
    if (!PHONE_RE.test(phone)) return setTopUpNote({ type: "error", text: MESSAGES.INVALID_PHONE });

    setTopUpBusy(true);
    setTopUpNote(null);
    try {
      const { data } = await apiClient.post("/wallet/mpesa-topup", { amount, phone });
      setTopUpAmount("");
      setTopUpNote({ type: "info", text: "Check your phone and enter your M-Pesa PIN to confirm." });
      await waitForTopUp(data.checkoutRequestId);
    } catch (err) {
      console.error("Top-up failed:", err);
      setTopUpNote({ type: "error", text: errText(err) });
    } finally {
      if (mounted.current) setTopUpBusy(false);
    }
  };

  const submitWithdraw = async (e) => {
    e.preventDefault();
    if (withdrawBusy) return;
    const amount = Number(withdrawAmount);
    if (!Number.isInteger(amount) || amount < MIN_WITHDRAW || amount > MAX_WITHDRAW) {
      return setWithdrawNote({ type: "error", text: `Enter a whole amount between ${fmt(MIN_WITHDRAW)} and ${fmt(MAX_WITHDRAW)}.` });
    }
    if (amount > (wallet?.balance || 0)) return setWithdrawNote({ type: "error", text: MESSAGES.INSUFFICIENT_FUNDS });
    if (!profilePhone) return setWithdrawNote({ type: "error", text: MESSAGES.PAYOUT_PHONE_NOT_SET });

    const masked = `${profilePhone.slice(0, 6)}***${profilePhone.slice(-3)}`;
    if (!window.confirm(`Withdraw ${fmt(amount)} to M-Pesa ${masked}?`)) return;

    setWithdrawBusy(true);
    setWithdrawNote(null);
    if (!withdrawKey.current) withdrawKey.current = crypto.randomUUID().replace(/-/g, "");
    try {
      await apiClient.post("/wallet/withdraw", { amount }, { headers: { "Idempotency-Key": withdrawKey.current } });
      withdrawKey.current = null;
      setWithdrawAmount("");
      setWithdrawNote({ type: "ok", text: "Withdrawal started. The money reaches your M-Pesa within a few minutes." });
      await load();
    } catch (err) {
      console.error("Withdrawal failed:", err);
      if (err.response) withdrawKey.current = null; // a definite answer, so the next try is a new request
      setWithdrawNote({ type: "error", text: errText(err) });
    } finally {
      if (mounted.current) setWithdrawBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <div className="w-8 h-8 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }
  if (loadError || !wallet) {
    return (
      <div className="max-w-md mx-auto py-20 text-center">
        <p className="text-sm font-semibold text-slate-600 mb-3">Couldn't load your wallet.</p>
        <button type="button" onClick={() => { setLoading(true); load(); }}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer">
          Try again
        </button>
      </div>
    );
  }

  const frozen = !!wallet.isFrozen;
  const input = "flex-1 min-w-0 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none";

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My Wallet</h1>
        <p className="mt-2 text-sm text-slate-500">Top up with M-Pesa, pay for orders and memberships, and withdraw to your phone.</p>
      </div>

      {frozen && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
          Your wallet is frozen. Top-ups and withdrawals are paused. Please contact support.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="rounded-2xl bg-emerald-600 p-6 text-white shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider opacity-80">Available balance</span>
          <span className="block text-3xl font-black mt-2 tracking-tight">{fmt(wallet.balance)}</span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Held in escrow</span>
          <span className="block text-3xl font-black mt-2 text-slate-900 tracking-tight">{fmt(wallet.escrowBalance)}</span>
          <p className="text-[10px] text-slate-400 mt-3 leading-normal">Released to sellers once you confirm delivery.</p>
        </div>

        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">📲 Top up with M-Pesa</span>
            <form onSubmit={submitTopUp} className="space-y-2">
              <input type="tel" inputMode="tel" value={topUpPhone} onChange={(e) => setTopUpPhone(e.target.value)}
                disabled={topUpBusy || frozen} placeholder="M-Pesa number, e.g. 0712345678" className={`${input} w-full`} />
              <div className="flex gap-2">
                <input type="number" inputMode="numeric" min={MIN_TOPUP} max={MAX_TOPUP} step="1" value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)} disabled={topUpBusy || frozen} placeholder="Amount (KES)" className={input} />
                <button type="submit" disabled={topUpBusy || frozen || !topUpAmount}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-2 transition disabled:opacity-40 cursor-pointer">
                  {topUpBusy ? "Waiting…" : "Top up"}
                </button>
              </div>
            </form>
            <Note note={topUpNote} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">💸 Withdraw to M-Pesa</span>
            {profilePhone ? (
              <p className="mb-2 text-[11px] text-slate-500">
                Sent to <b>{profilePhone.slice(0, 6)}***{profilePhone.slice(-3)}</b>
              </p>
            ) : (
              <p className="mb-2 text-[11px] text-amber-700">Add a phone number to your profile to withdraw.</p>
            )}
            <form onSubmit={submitWithdraw} className="flex gap-2">
              <input type="number" inputMode="numeric" min={MIN_WITHDRAW} max={MAX_WITHDRAW} step="1" value={withdrawAmount}
                onChange={(e) => { setWithdrawAmount(e.target.value); withdrawKey.current = null; }}
                disabled={withdrawBusy || frozen} placeholder="Amount (KES)" className={input} />
              <button type="submit" disabled={withdrawBusy || frozen || !withdrawAmount || !profilePhone}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold px-3 py-2 transition disabled:opacity-40 cursor-pointer">
                {withdrawBusy ? "Processing…" : "Withdraw"}
              </button>
            </form>
            <Note note={withdrawNote} />
          </div>
        </div>
      </div>

      {withdrawals.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm mb-8">
          <h2 className="text-base font-bold text-slate-800 mb-4">Recent withdrawals</h2>
          <ul className="divide-y divide-slate-100">
            {withdrawals.map((w, i) => (
              <li key={`${w.createdAt}-${i}`} className="flex items-center justify-between py-3 text-xs">
                <span className="font-semibold text-slate-700">{fmt(w.amount)}</span>
                <span className="text-slate-400">{fmtDate(w.createdAt)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-extrabold uppercase text-slate-600">
                  {WITHDRAWAL_STATUS[w.status] || w.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-800">Transaction history</h2>
          <Link to={ROUTES.MARKETPLACE} className="text-[11px] font-bold text-emerald-700 underline">Go shopping</Link>
        </div>

        {wallet.transactions?.length > 0 ? (
          <ul className="space-y-3">
            {wallet.transactions.map((t) => {
              const amount = Number(t.amount) || 0;
              const credit = amount >= 0;
              return (
                <li key={t.transactionId || t._id} className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800">{TYPE_LABELS[t.type] || "Transaction"}</p>
                    {t.description && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t.description}</p>}
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">{t.createdAt ? fmtDate(t.createdAt) : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-black ${credit ? "text-emerald-600" : "text-slate-900"}`}>
                      {credit ? "+" : "−"}{fmt(Math.abs(amount))}
                    </p>
                    <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                      t.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700"
                      : t.status === "ESCROW_HELD" ? "bg-amber-50 text-amber-700"
                      : t.status === "FAILED" ? "bg-red-50 text-red-700"
                      : "bg-slate-100 text-slate-500"
                    }`}>
                      {t.status === "COMPLETED" ? "Success" : String(t.status || "Pending").replace("_", " ")}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-center py-12 text-slate-400 text-xs">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}
