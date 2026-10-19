import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";

import HomePage from "../features/public/home/HomePage";
import MarketHub from "../features/public/market/MarketHub";
import ProductDetails from "../features/public/ProductDetails/ProductDetails";
import MyShopDashboard from "../features/vendor-dashboard/MyShopDashboard";
import MyTeamDirectory from "../features/vendor-dashboard/MyTeamDirectory";
import Profile from "../features/public/Profile/Profile";
import Wallet from "../features/public/wallet/Wallet";
import InboxConversationView from "../features/chats/components/InboxConversationView";
import NotificationsPage from "../features/public/notifications/NotificationsPage";
import CheckoutPage from "../features/public/Checkout/CheckoutPage";
import RegisterPage from "../features/auth/pages/RegisterPage/RegisterPage";
import MembershipPage from "../features/membership/MembershipPage";

import useAuth from "../features/auth/hooks/useAuth";
import ROUTES from "../constants/routes";

function Screen({ children }) {
  return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">{children}</div>;
}

/**
 * Signed in AND has a Sokodigi account. Wallet, checkout, messages, notifications.
 * Client-side guards are only convenience: the server enforces every rule again.
 */
function RequireAuth({ children }) {
  const { auth, refreshProfile } = useAuth();

  if (auth.loading) {
    return (
      <Screen>
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </Screen>
    );
  }
  if (auth.loadError) {
    return (
      <Screen>
        <div>
          <p className="text-sm font-semibold text-slate-600 mb-3">Couldn't reach Sokodigi. Check your connection.</p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 cursor-pointer"
          >
            Try again
          </button>
        </div>
      </Screen>
    );
  }
  if (!auth.authenticated) return <Navigate to={ROUTES.HOME} replace />;
  return children;
}

/**
 * Marketer pages. Active, paid members only, unless allowPending (the membership page itself).
 * auth.destination comes from the provider: "dashboard" | "membership" | "suspended" | "home".
 */
function RequireMarketer({ children, allowPending = false }) {
  return (
    <RequireAuth>
      <MarketerCheck allowPending={allowPending}>{children}</MarketerCheck>
    </RequireAuth>
  );
}

function MarketerCheck({ children, allowPending }) {
  const { auth } = useAuth();
  if (auth.user?.accountCategory !== "network") return <Navigate to={ROUTES.MARKETPLACE} replace />;
  if (auth.destination === "suspended") return <Navigate to={ROUTES.HOME} replace />;
  if (!allowPending && auth.destination !== "dashboard") return <Navigate to={ROUTES.MEMBERSHIP} replace />;
  return children;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path={ROUTES.HOME} element={<MainLayout />}>
          {/* Public */}
          <Route index element={<HomePage />} />
          <Route path={ROUTES.MARKETPLACE} element={<MarketHub />} />
          <Route path={ROUTES.PRODUCT_DETAILS} element={<ProductDetails />} />
          <Route path={ROUTES.PUBLIC_PROFILE} element={<Profile />} />
          <Route path={ROUTES.REGISTER} element={<RegisterPage />} />

          {/* Any signed-in account (buyers and marketers) */}
          <Route path={ROUTES.CHECKOUT} element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path={ROUTES.MESSAGES} element={<RequireAuth><InboxConversationView /></RequireAuth>} />
          <Route path={ROUTES.NOTIFICATIONS} element={<RequireAuth><NotificationsPage /></RequireAuth>} />
          <Route path={ROUTES.WALLET} element={<RequireAuth><Wallet /></RequireAuth>} />

          {/* Marketers: the membership page is open to pending and lapsed members too */}
          <Route path={ROUTES.MEMBERSHIP} element={<RequireMarketer allowPending><MembershipPage /></RequireMarketer>} />
          <Route path={ROUTES.MY_TEAM} element={<RequireMarketer><MyTeamDirectory /></RequireMarketer>} />
        </Route>

        {/* Merchant dashboard (outside the public layout) */}
        <Route path={ROUTES.MEMBER_DASHBOARD} element={<RequireMarketer><MyShopDashboard /></RequireMarketer>} />

        <Route path={ROUTES.NOT_FOUND} element={<Navigate to={ROUTES.HOME} replace />} />
      </Routes>
    </BrowserRouter>
  );
}
