import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";

// Core View Component Injections
import HomePage from "../features/public/home/HomePage";
import MarketHub from "../features/public/market/MarketHub"; 
import ProductDetails from "../features/public/ProductDetails/ProductDetails";
import MyShopDashboard from "../features/vendor-dashboard/MyShopDashboard"; 
import MyTeamDirectory from "../features/vendor-dashboard/MyTeamDirectory";
import Profile from "../features/public/Profile/Profile"; 

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

  // 1. Await application authentication context synchronization loop
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

  // 2. Extract permission criteria from user profile or document structures
  const userCategory = auth?.profile?.accountCategory || auth?.user?.accountCategory || "retail";
  const isAuthenticated = auth?.authenticated || !!auth?.currentUser;

  // 3. ENFORCEMENT GATE: Bounce users back to the marketplace if they aren't "network" affiliates
  if (!isAuthenticated || userCategory !== "network") {
    console.warn(`[Routing Deflection] Diverted user tier "${userCategory}" away from merchant views.`);
    return <Navigate to={ROUTES.MARKETPLACE} replace />;
  }

  // 4. Verification satisfied, release the isolated merchant workspace
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
           <Route 
    path="/my-team" 
    element={
      <ProtectedVendorRoute>
        <MyTeamDirectory />
      </ProtectedVendorRoute>
    } 
  />
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
