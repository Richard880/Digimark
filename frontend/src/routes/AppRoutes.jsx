import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";

import HomePage from "../features/public/home/HomePage";
import MarketHub from "../features/public/market/MarketHub";
import ProductDetails from "../features/public/ProductDetails/ProductDetails";
import MyTeamDirectory from "../features/vendor-dashboard/MyTeamDirectory";
import Profile from "../features/public/Profile/Profile";
import Wallet from "../features/public/wallet/Wallet";
import InboxConversationView from "../features/chats/components/InboxConversationView";
import NotificationsPage from "../features/public/notifications/NotificationsPage";
import CheckoutPage from "../features/public/Checkout/CheckoutPage";
import RegisterPage from "../features/auth/pages/RegisterPage/RegisterPage";
import MembershipPage from "../features/membership/MembershipPage";
import BecomeMarketerPage from "../features/membership/BecomeMarketerPage";


import AdminDashboard from "../features/admin/AdminDashboard";
import LegalPage from "../features/public/legal/LegalPage";

import useAuth from "../features/auth/hooks/useAuth";
import ROUTES from "../constants/routes";

import useShop from "../features/shop/useShop";
import JoinShop from "../features/shop/JoinShop";
import StaffDashboard from "../features/shop/StaffDashboard";
import MyShopDashboard from "../features/vendor-dashboard/MyShopDashboard";

function Screen({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-center">
      {children}
    </div>
  );
}

function RequireAuth({ children }) {
  const { auth, refreshProfile } = useAuth();

  if (auth.loading) {
    return (
      <Screen>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </Screen>
    );
  }

  if (auth.loadError) {
    return (
      <Screen>
        <div>
          <p className="mb-3 text-sm font-semibold text-slate-600">
            Couldn't reach Sokodigi. Check your connection.
          </p>
          <button
            type="button"
            onClick={() => refreshProfile()}
            className="cursor-pointer rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Try again
          </button>
        </div>
      </Screen>
    );
  }

  if (!auth.authenticated) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return children;
}

/** Marketer pages for active members, with optional access for pending members. */
function RequireMarketer({ children, allowPending = false }) {
  return (
    <RequireAuth>
      <MarketerCheck allowPending={allowPending}>{children}</MarketerCheck>
    </RequireAuth>
  );
}

function MarketerCheck({ children, allowPending }) {
  const { auth } = useAuth();

  if (auth.user?.accountCategory !== "network") {
    return <Navigate to={ROUTES.MARKETPLACE} replace />;
  }

  if (auth.destination === "suspended") {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  if (!allowPending && auth.destination !== "dashboard") {
    return <Navigate to={ROUTES.MEMBERSHIP} replace />;
  }

  return children;
}

/** Membership page for signed-in network accounts, including pending or lapsed members. */
function RequireNetworkAccount({ children }) {
  const { auth } = useAuth();
  if (auth.loading) return <Screen><div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" /></Screen>;
  if (!auth.authenticated) return <Navigate to={ROUTES.HOME} replace />;
  if (auth.user?.accountCategory !== "network") return <Navigate to={ROUTES.BECOME_MARKETER} replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { auth } = useAuth();

  if (auth.loading) {
    return (
      <Screen>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </Screen>
    );
  }

  if (!auth.authenticated || !["admin", "super_admin"].includes(auth.role)) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  return children;
}

function RequireShopAccess({ children }) {
  const { auth } = useAuth();
  const { shop, state, refresh } = useShop();

  if (auth.loading || state === "loading") {
    return (
      <Screen>
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
      </Screen>
    );
  }

  if (!auth.authenticated) {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  if (state === "error") {
    return (
      <Screen>
        <p className="text-xs text-slate-600">
          Couldn't load your shop.{" "}
          <button
            type="button"
            onClick={refresh}
            className="font-bold text-emerald-700 underline"
          >
            Try again
          </button>
        </p>
      </Screen>
    );
  }

  if (!shop) {
    return (
      <Navigate
        to={
          auth.user?.accountCategory === "network"
            ? ROUTES.MEMBERSHIP
            : ROUTES.HOME
        }
        replace
      />
    );
  }

  if (shop.role === "owner" && shop.status === "pending") {
    return <Navigate to={ROUTES.MEMBERSHIP} replace />;
  }

  return children;
}

function ShopHome() {
  const { shop } = useShop();
  return shop?.role === "owner" ? <MyShopDashboard /> : <StaffDashboard />;
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
          <Route path={ROUTES.TERMS} element={<LegalPage page="terms" />} />
          <Route path={ROUTES.PRIVACY} element={<LegalPage page="privacy" />} />

          {/* Signed-in accounts */}
          <Route
            path={ROUTES.CHECKOUT}
            element={
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.MESSAGES}
            element={
              <RequireAuth>
                <InboxConversationView />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.NOTIFICATIONS}
            element={
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.WALLET}
            element={
              <RequireAuth>
                <Wallet />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.MY_PROFILE}
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.BECOME_MARKETER}
            element={
              <RequireAuth>
                <BecomeMarketerPage />
              </RequireAuth>
            }
          />
          <Route
            path={ROUTES.JOIN_SHOP}
            element={
              <RequireAuth>
                <JoinShop />
              </RequireAuth>
            }
          />

          {/* Marketer pages */}
          <Route
            path={ROUTES.MEMBERSHIP}
            element={
              <RequireNetworkAccount>
                <MembershipPage />
              </RequireNetworkAccount>
            }
          />
          <Route
            path={ROUTES.MY_TEAM}
            element={
              <RequireMarketer>
                <MyTeamDirectory />
              </RequireMarketer>
            }
          />

          {/* Shop workspace */}
          <Route
            path={ROUTES.MEMBER_DASHBOARD}
            element={
              <RequireShopAccess>
                <ShopHome />
              </RequireShopAccess>
            }
          />
        </Route>

        {/* Admin dashboard */}
        <Route
          path={ROUTES.ADMIN_DASHBOARD}
          element={
            <RequireAdmin>
              <AdminDashboard />
            </RequireAdmin>
          }
        />

        <Route
          path={ROUTES.NOT_FOUND}
          element={<Navigate to={ROUTES.HOME} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
