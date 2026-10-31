import { useEffect } from "react";

export const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
export const btn = "min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-50";
export const ROLE = { owner: "Owner", manager: "Manager", cashier: "Cashier", stock_clerk: "Stock clerk" };
export const when = (d) => new Date(d).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const ERR = {
  PLAN_LIMIT_REACHED: "You've reached your plan's limit for that. Upgrade to add more.", PLAN_UPGRADE_REQUIRED: "That needs an active membership on a higher plan.",
  FORBIDDEN_ROLE: "Your role can't do that.", NO_SHOP_ACCESS: "You no longer have access to this shop.", BRANCH_FORBIDDEN: "You don't work at that branch.",
  BRANCH_NOT_FOUND: "That branch isn't available.", INSUFFICIENT_STOCK: "Not enough stock.", STOCK_CHANGE_NOT_POSSIBLE: "That would take stock below zero or over the limit.",
  NOTE_REQUIRED: "Add a short reason when taking stock out.", INVALID_STOCK_CHANGE: "Enter a whole number like 5 or -2.", SAME_BRANCH: "Choose two different branches.",
  BRANCH_HAS_STOCK: "Move this branch's stock out first.", BRANCH_IN_USE: "Staff are still assigned to this branch.", CANNOT_ARCHIVE_MAIN: "The main branch can't be archived.",
  INVALID_CODE: "That code isn't valid, or it has expired.", ALREADY_STAFF: "You already work at a shop.", MARKETERS_CANNOT_JOIN: "Marketer accounts can't join a shop as staff. Use a separate account.",
  TERMINAL_REVOKED: "This device was removed from the shop.", TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.", BRANCH_REQUIRED: "Choose at least one branch.",
};
export const errMsg = (e) => (!e.response ? "Couldn't reach Sokodigi. This can't be done offline." : e.response.data?.error === "INSUFFICIENT_STOCK" && e.response.data.product ? `Not enough stock of ${e.response.data.product}.` : ERR[e.response.data?.error] || "Something went wrong. Please try again.");
export const Err = ({ text }) => (text ? <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{text}</p> : null);

export function Sheet({ title, onClose, children, z = 3000 }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="fixed inset-0 flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" style={{ zIndex: z }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-base font-black text-slate-900">{title}</h3><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button></div>
        {children}
      </div>
    </div>
  );
}
