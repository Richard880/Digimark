import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";

const KEY = "sokodigi_welcome_seen";

const CARDS = [
  { icon: "🔒", title: "Shop safely", text: "Every payment is held in escrow. The seller is paid only when you give them your delivery PIN after your item arrives." },
  { icon: "📲", title: "Pay with M-Pesa", text: "Top up your wallet in seconds, then pay for orders in one tap. You can also chat privately with sellers before you buy." },
  { icon: "💼", title: "Sell and earn", text: "Open your own shop and promote other sellers' products for a 5% bonus. Earnings depend on your own sales and aren't guaranteed." },
];

const seen = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return true; } }; // if storage is blocked, never nag
const markSeen = () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } };

export default function WelcomeSheet({ onSignIn }) {
  const { auth } = useAuth();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const primary = useRef(null);

  const eligible = pathname === ROUTES.HOME && !auth.loading && !auth.authenticated && !new URLSearchParams(search).get("sponsor");

  // Show once, a moment after the page paints. Marked as seen as soon as it shows.
  useEffect(() => {
    if (!eligible || seen()) return undefined;
    const t = setTimeout(() => { markSeen(); setOpen(true); }, 1200);
    return () => clearTimeout(t);
  }, [eligible]);

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    primary.current?.focus();
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, i]);

  if (!open) return null;

  const last = i === CARDS.length - 1;
  const c = CARDS[i];
  const go = (to) => { close(); navigate(to); };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div role="dialog" aria-modal="true" aria-label="Welcome to Sokodigi" className="w-full max-w-md rounded-t-3xl bg-white p-6 text-center shadow-2xl sm:rounded-3xl" style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}>
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-emerald-700">Welcome to Sokodigi</span>
          <button type="button" onClick={close} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">Skip</button>
        </div>

        <div className="py-8" aria-live="polite">
          <p className="text-5xl" aria-hidden="true">{c.icon}</p>
          <h2 className="mt-4 text-xl font-black text-slate-900">{c.title}</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-600">{c.text}</p>
        </div>

        <div className="mb-5 flex justify-center gap-2" role="group" aria-label="Welcome steps">
          {CARDS.map((_, n) => <button key={n} type="button" onClick={() => setI(n)} aria-label={`Step ${n + 1}`} aria-current={n === i ? "step" : undefined} className={`h-2 rounded-full transition-all ${n === i ? "w-7 bg-emerald-700" : "w-2 bg-slate-300"}`} />)}
        </div>

        {last ? (
          <div className="space-y-2">
            <button ref={primary} type="button" onClick={() => go(ROUTES.MARKETPLACE)} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800">Browse the MarketHub</button>
            <button type="button" onClick={() => go(ROUTES.REGISTER)} className="min-h-12 w-full rounded-xl border border-emerald-800/20 text-sm font-bold text-emerald-900 hover:bg-emerald-50">Create a free account</button>
            {onSignIn && <button type="button" onClick={() => { close(); onSignIn(); }} className="pt-1 text-xs font-bold text-slate-500 underline">I already have an account</button>}
          </div>
        ) : (
          <button ref={primary} type="button" onClick={() => setI(i + 1)} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800">Next</button>
        )}
      </div>
    </div>
  );
}
