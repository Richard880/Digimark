import { useEffect } from "react";
import { Link } from "react-router-dom";
import ROUTES from "../../constants/routes";

// Keep these in sync with config/plans.js (levels) and config/activity.js (checks)
const LEVELS = [[1, 25, 10], [2, 15, 100], [3, 9, 1000], [4, 6, 10000]]; // [level, percent, places]
const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;

const H = ({ children }) => <h3 className="mb-1.5 text-sm font-black text-slate-900">{children}</h3>;

export function NetworkExplainerContent({ fee = 100, planName = "Phase 1" }) {
  const cut = (pct) => Math.floor((fee * pct) / 100);
  const three = 3 * cut(25);

  return (
    <div className="space-y-5 text-sm leading-relaxed text-slate-700">
      <div className="space-y-1.5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-900">
        <p>• Membership is a monthly <b>cost</b>. You pay it whether or not you earn anything.</p>
        <p>• You can earn from selling, from promoting products, and from a share of membership payments in your network.</p>
        <p>• Network commissions exist only when real people join and pay. <b>Nobody can promise you income</b>, and many members will earn little or nothing from the network.</p>
      </div>

      <section>
        <H>What you pay</H>
        <p>Membership is billed every 30 days from your wallet: Phase 1 is Ksh 100, Phase 2 is Ksh 200, Phase 3 is Ksh 500 and Phase 4 is Ksh 1,000. It keeps your shop page live and makes you eligible for the earnings below. Membership fees are not refundable once paid. {/* match your refund policy */}</p>
      </section>

      <section>
        <H>Three ways to earn</H>
        <ol className="list-decimal space-y-1 pl-5">
          <li><b>Selling your own products.</b> You receive the price minus Sokodigi's 1% fee. Delivery fees are paid to you in full.</li>
          <li><b>Promoting other sellers' products.</b> You earn a 5% bonus when someone buys through your share link.</li>
          <li><b>Network commissions.</b> When a member in your network pays their membership, a share is paid to the members above them, up to four levels:</li>
        </ol>
        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 text-xs">
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 bg-slate-50 px-3 py-2 font-black text-slate-500">
            <span>Level</span><span>Share</span><span className="text-right">On {fmt(fee)}</span>
          </div>
          {LEVELS.map(([l, pct, places]) => (
            <div key={l} className="grid grid-cols-[1fr_auto_auto] gap-x-4 border-t border-slate-100 px-3 py-2">
              <span>Level {l} <span className="text-slate-400">(up to {places.toLocaleString("en-KE")} people)</span></span>
              <span className="font-bold">{pct}%</span>
              <span className="text-right font-bold text-emerald-800">{fmt(cut(pct))}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Those place counts are the most the network allows, not a forecast. Very few members will ever fill all four levels. New members are placed in the next open spot, so some people under you may have been invited by someone else.</p>
      </section>

      <section>
        <H>What you need to receive commissions</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>An active membership that hasn't expired.</li>
          <li>At least <b>3 of 5</b> monthly checks passed: a new active recruit, 5 wallet transactions of Ksh 50 or more, a product listed, a completed order of Ksh 200 or more, and being active on 5 different days.</li>
          <li>New members count as eligible during a 14-day welcome period.</li>
        </ul>
      </section>

      <section>
        <H>When a commission isn't paid</H>
        <p>If a member isn't eligible when someone below them pays, their share moves up to the next eligible member, for up to two steps. If nobody qualifies, Sokodigi keeps it. The same applies to you: if you aren't eligible at that moment, you miss that commission and it can't be claimed later.</p>
      </section>

      <section>
        <H>A simple example</H>
        <p>Three people you brought in each pay {planName} ({fmt(fee)}) this month and you're eligible. You earn 3 × {fmt(cut(25))} = <b>{fmt(three)}</b>. That is {three < fee ? "less than" : "more than"} your own {planName} fee of {fmt(fee)}{three < fee ? ", so you'd also need product sales or a bigger team to come out ahead" : ""}.</p>
      </section>

      <section>
        <H>Before you join</H>
        <ul className="list-disc space-y-1 pl-5">
          <li>Only pay with money you can afford to lose. Never borrow to join.</li>
          <li>Be careful of anyone, including people who invite you, who promises guaranteed or quick income.</li>
          <li>You don't need to join to shop on Sokodigi, and you can sell and promote products without recruiting anyone.</li>
        </ul>
      </section>

      <p className="text-xs text-slate-500">This is a plain-language summary. Our <Link to={ROUTES.TERMS} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-700 underline">Terms of use</Link> apply.</p>
    </div>
  );
}

export function NetworkExplainerSheet({ onClose, fee, planName }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[3100] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="How the network works" className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-black text-slate-900">How the network works</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        <div className="overflow-y-auto px-5 py-4"><NetworkExplainerContent fee={fee} planName={planName} /></div>
        <div className="border-t border-slate-100 p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
          <button type="button" onClick={onClose} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800">I've read this</button>
        </div>
      </div>
    </div>
  );
}

export default NetworkExplainerSheet;
