import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import ROUTES from "../../constants/routes";
import useOutbox from "../../offline/useOutbox";
import useShop from "./useShop";
import PosTab from "../vendor-dashboard/pos/PosTab";
import ReportsTab from "../vendor-dashboard/pos/ReportsTab";
import CustomersTab from "../vendor-dashboard/CustomersTab";
import StockTab from "./StockTab";
import { ROLE } from "./ui";

export default function StaffDashboard() {
  const navigate = useNavigate();
  const { auth, logout } = useAuth();
  const { shop, ent, can } = useShop();
  const uid = auth.user?._id ? String(auth.user._id) : "";
  const outbox = useOutbox(uid, false); // OutboxSync in the layout already syncs in the background

  const tabs = [
    ["pos", "🧮", "POS", can("sell")],
    ["customers", "👥", "Customers", can("customers.read")],
    ["stock", "📦", "Stock", can("stock.view")],
    ["reports", "📊", "Reports", can("reports")],
  ].filter((t) => t[3]);

  const [tab, setTab] = useState("");

  useEffect(() => {
    if (!tab && tabs.length) setTab(tabs[0][0]);
  }, [tab, tabs]);

  if (!shop) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-900">
              {shop.ownerName}
            </p>
            <p className="text-[11px] text-slate-500">
              {ROLE[shop.role]} · {shop.memberName}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.HOME)}
              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-700"
            >
              Home
            </button>
            <button
              type="button"
              onClick={logout}
              className="min-h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold text-red-600"
            >
              Log out
            </button>
          </div>
        </div>

        <nav
          className="mx-auto hidden max-w-6xl gap-1 px-6 md:flex"
          aria-label="Sections"
        >
          {tabs.map(([k, icon, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={`border-b-2 px-4 py-3 text-xs font-black ${
                tab === k
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-400"
              }`}
            >
              {icon} {label}
              {k === "pos" && outbox.waiting.length > 0
                ? ` (${outbox.waiting.length})`
                : ""}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-3 py-5 sm:px-6">
        {ent && !ent.active && (
          <p
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900"
          >
            This shop's membership has expired, so selling is paused. Ask the
            owner to renew.
            {outbox.waiting.length > 0 &&
              " Your saved sales will send once it's renewed."}
          </p>
        )}

        {tab === "pos" && <PosTab outbox={outbox} />}
        {tab === "customers" && <CustomersTab />}
        {tab === "stock" && <StockTab />}
        {tab === "reports" && <ReportsTab />}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Sections"
      >
        {tabs.map(([k, icon, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={tab === k}
            onClick={() => setTab(k)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
              tab === k ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {icon}
            </span>
            {label}
            {k === "pos" && outbox.waiting.length > 0
              ? ` (${outbox.waiting.length})`
              : ""}
          </button>
        ))}
      </nav>
    </div>
  );
}
