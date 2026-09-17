import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "../layouts/MainLayout/MainLayout";

// Core View Component Injections
import HomePage from "../features/public/home/HomePage";
import MarketHub from "../features/public/market/MarketHub"; 
import ProductDetails from "../features/public/ProductDetails/ProductDetails";
import MyShopDashboard from "../features/vendor-dashboard/MyShopDashboard"; // <-- Full-screen premium dashboard remains isolated
import Profile from "../features/public/Profile/Profile"; 

// Import your unified routing constants
import ROUTES from "../constants/routes";

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
          {/* Default landing above-the-fold window canvas */}
          <Route index element={<HomePage />} />
          
          {/* MarketHub section using the exact semantic reference path string */}
          <Route path={ROUTES.MARKETPLACE} element={<MarketHub />} />
          
          {/* Decoupled Single Product Details View */}
          <Route path={ROUTES.PRODUCT_DETAILS} element={<ProductDetails />} />

          {/* 🎯 THE FIX: Nest your public profile here so it retains your Navbar and search logic! */}
          <Route path={ROUTES.PUBLIC_PROFILE} element={<Profile />} />
        </Route>

        {/* ==========================================================================
           2. ISOLATED MERCHANT SYSTEM (Renders as a full-screen, independent app frame)
           ========================================================================== */}
        <Route path={ROUTES.MEMBER_DASHBOARD} element={<MyShopDashboard />} />

        {/* ==========================================================================
           3. UNIVERSAL EXPLICIT FALLBACK REDIRECT
           ========================================================================== */}
        <Route path={ROUTES.NOT_FOUND} element={<Navigate to={ROUTES.HOME} replace />} />
        
      </Routes>
    </BrowserRouter>
  );
}
