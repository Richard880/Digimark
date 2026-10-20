import { Navigate, useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import MarketerSetup from "../auth/components/MarketerSetup/MarketerSetup";
import ROUTES from "../../constants/routes";

export default function BecomeMarketerPage() {
  const { auth } = useAuth();
  const navigate = useNavigate();

  // Already a marketer: send them where they belong
  if (auth.user?.accountCategory === "network") {
    return <Navigate to={auth.destination === "dashboard" ? ROUTES.MEMBER_DASHBOARD : ROUTES.MEMBERSHIP} replace />;
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-8 space-y-5">
      <header className="text-center">
        <h1 className="text-xl font-bold text-slate-800">Sell &amp; earn on Sokodigi</h1>
        <p className="mt-1 text-xs text-slate-500">
          Open your own shop, promote other sellers' products for a 5% bonus, and earn from your network.
          A small monthly membership (from Ksh 100) keeps your shop live.
        </p>
      </header>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <MarketerSetup onDone={() => navigate(ROUTES.MEMBERSHIP)} />
      </div>
    </div>
  );
}
