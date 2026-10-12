import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";

// Core View Component Injections
import HomePage from "../features/public/home/HomePage";
import MarketHub from "../features/public/market/MarketHub"; 
import ProductDetails from "../features/public/ProductDetails/ProductDetails";
import MyShopDashboard from "../features/vendor-dashboard/MyShopDashboard"; 
import MyTeamDirectory from "../features/vendor-dashboard/MyTeamDirectory";
import Profile from "../features/public/Profile/Profile"; 
import Wallet from "../features/public/wallet/Wallet";
import InboxConversationView from "../features/chats/components/InboxConversationView";
import NotificationsPage from "../features/public/notifications/NotificationsPage";

// 🎯 IMPORTED NEW DEDICATED CHECKOUT WORKSPACE
import CheckoutPage from "../features/public/Checkout/CheckoutPage"; 

// Import your unified authentication state hook
import useAuth from "../features/auth/hooks/useAuth";

// Import your unified routing constants
import ROUTES from "../constants/routes";

/**
 * 🛡️ MERCHANT ROUTE GUARD
 * Intercepts out-of-bounds user categories and redirects them away from the shop panels.
 */
function ProtectedVendorRoute({ children }) {
  const { auth } = useAuth();

  if (auth?.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-500 animate-pulse">
            Verifying account permissions...
          </p>
        </div>
      </div>
    );
  }

  const userCategory = auth?.profile?.accountCategory || auth?.user?.accountCategory || "retail";
  const isAuthenticated = auth?.authenticated || !!auth?.currentUser;

  if (!isAuthenticated || userCategory !== "network") {
    console.warn(`[Routing Deflection] Diverted user tier "${userCategory}" away from merchant views.`);
    return <Navigate to={ROUTES.MARKETPLACE} replace />;
  }

  return children;
}

/**
 * 🛡️ STANDARD AUTH GUARD FOR SECURED ROUTES
 * Bounces unauthenticated guests back to the homepage if they try to access internal workflows.
 */
function ProtectedChatRoute({ children }) {
  const { auth } = useAuth();
  const isAuthenticated = auth?.authenticated || !!auth?.currentUser;

  if (auth?.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * 🗺️ Global Routing Orchestration Matrix
 */
export default function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        
        {/* ==========================================================================
           1. PRIMARY PUBLIC CORE LAYOUT TREE (Shares navbar, footer & landing themes)
           ========================================================================== */}
        <Route path={ROUTES.HOME} element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path={ROUTES.MARKETPLACE} element={<MarketHub />} />
          <Route path={ROUTES.PRODUCT_DETAILS} element={<ProductDetails />} />
          <Route path={ROUTES.PUBLIC_PROFILE} element={<Profile />} />
          
          {/* 🎯 REGISTERED ESCROW CHECKOUT NODE */}
          <Route 
            path="/checkout" 
            element={
              <ProtectedChatRoute>
                <CheckoutPage />
              </ProtectedChatRoute>
            } 
          />

          {/* 🎯 REGISTERED MESSAGES PATH NODE */}
          <Route 
            path="/messages" 
            element={
              <ProtectedChatRoute>
                <InboxConversationView />
              </ProtectedChatRoute>
            } 
          />

          {/* 🎯 REGISTERED DEDICATED NOTIFICATIONS PANEL NODE */}
          <Route 
            path="/notifications" 
            element={
              <ProtectedChatRoute>
                <NotificationsPage />
              </ProtectedChatRoute>
            } 
          />

          <Route 
            path="/my-team" 
            element={
              <ProtectedVendorRoute>
                <MyTeamDirectory />
              </ProtectedVendorRoute>
            } 
          />

          <Route path="/wallet" element={<ProtectedVendorRoute><Wallet /></ProtectedVendorRoute>} />
        </Route>

        {/* ==========================================================================
           2. ISOLATED MERCHANT SYSTEM (Secured via Client-Side Deflection Guard)
           ========================================================================== */}
        <Route 
          path={ROUTES.MEMBER_DASHBOARD} 
          element={
            <ProtectedVendorRoute>
              <MyShopDashboard />
            </ProtectedVendorRoute>
          } 
        />

        {/* ==========================================================================
           3. UNIVERSAL EXPLICIT FALLBACK REDIRECT
           ========================================================================== */}
        <Route path={ROUTES.NOT_FOUND} element={<Navigate to={ROUTES.HOME} replace />} />
        
      </Routes>
    </BrowserRouter>
  );
}
