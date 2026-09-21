import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth"; // 🎯 Injected to read user categories safely
import styles from "./ProductDetails.module.css";

// Force production builds to use clean relative roots, falling back to localhost only in development
const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth(); // Access global authorization session context keys

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isPinning, setIsPinning] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        
        // 🎯 FIXED PATH: Using your dynamic environment base URL path configuration
        const response = await fetch(`${API_URL}/api/products/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Product records do not match active inventory indexes (404).");
          }
          throw new Error("Hanging sync connection error.");
        }

        const data = await response.json();
        setProduct(data);
      } catch (err) {
        setErrorMsg(err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDetails();
  }, [id]);

  // =========================================================================
  // 📌 IN-APP SOCIAL SELL DROP EXPANSION PIPELINE ACTION
  // =========================================================================
  const handlePinProduct = async () => {
    setIsPinning(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${API_URL}/api/products/share`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          productId: id, 
          customNotes: `Affiliate recommendation: Pick up this premium ${product?.name || "item"} today!` 
        })
      });

      const data = await response.json();
      if (response.ok) {
        alert("🎉 Product successfully pinned to your Shared Storefront catalog profile view!");
        navigate("/profile"); // Re-routes them back to view their fresh storefront tab card
      } else {
        alert(data.reason || "This product is already pinned to your storefront layout matrix.");
      }
    } catch (err) {
      console.error("Failed to execute share connection transaction:", err);
      alert("Network timeout or connection boundary error.");
    } finally {
      setIsPinning(false);
    }
  };

  const handleBackNavigation = () => {
    navigate("/marketplace");
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
        <div className="w-9 h-9 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <p className="text-sm font-medium text-slate-600">Resolving component parameters...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={styles["error-wrapper"]}>
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold mb-3 border border-red-100">
          !
        </div>
        <h3 className="text-base font-bold text-slate-800">Inventory Error</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">{errorMsg}</p>
        <button type="button" onClick={handleBackNavigation} className="mt-4 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg">
          Back to Hub
        </button>
      </div>
    );
  }

  // 🎯 SAFETY BOUNDARY ENFORCEMENT CHECK: Only show the "Pin to Storefront" trigger to verified network affiliates
  const isNetworkAffiliate = auth?.profile?.accountCategory === "network" || auth?.user?.accountCategory === "network";

  return (
    <div className={styles["details-shell"]}>
      <button type="button" onClick={handleBackNavigation} className={styles["back-action-anchor"]}>
        <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to MarketHub</span>
      </button>

      <div className={styles["details-container"]}>
        
        {/* Left Side Section: Absolute Cloudinary Asset Canvas */}
        <div className={styles["image-canvas-side"]}>
          {product?.fromNetwork && (
            <span className="absolute top-4 left-4 z-10 px-3 py-1 rounded-md text-xs font-extrabold tracking-wide uppercase bg-blue-600 text-white shadow-sm">
              My Network Connection
            </span>
          )}
          <img 
            src={product?.imageUrl || "https://unsplash.com"} 
            crossOrigin="anonymous" // Handles your direct Cloudinary delivery unblocked
            alt={product?.name || "Inventory Item"} 
            onError={(e) => { e.currentTarget.src = 'https://unsplash.com'; }}
          />
        </div>

        {/* Right Side Section: Metric Fields Sheet */}
        <div className={styles["meta-content-side"]}>
          <div>
            <span className={styles["category-tag"]}>
              {product?.category || "General Listing"}
            </span>
            <h1 className={styles["product-headline"]}>
              {product?.name || "Untitled Profile"}
            </h1>
            <p className={styles["vendor-text"]}>
              Sold and Distributed by: <strong>{product?.brandName || "Independent Affiliate"}</strong>
            </p>
          </div>

          <div className="space-y-4 my-6 border-y border-slate-100 py-4">
            <div className={styles["price-tag-row"]}>
              <span className="text-xs text-slate-400 font-medium">Customer Retail Pricing</span>
              <span className={styles["price-readout"]}>
                Ksh {parseFloat(product?.price || 0).toLocaleString()}
              </span>
            </div>

            {/* 🎯 DISPLAY AVAILABLE MARGIN INCENTIVES EXCLUSIVELY TO YOUR MARKETERS */}
            {isNetworkAffiliate && product?.affiliateCommission > 0 && (
              <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-800">
                <span className="font-medium">Your Direct Share Reward:</span>
                <span className="font-black text-sm text-emerald-700">Ksh {product.affiliateCommission.toLocaleString()}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 bg-slate-50/60 p-3 rounded-xl border border-slate-100">
              <div>
                <span className="text-slate-400 block mb-0.5">Logistics Reserve</span>
                <span className="font-semibold text-slate-800">{product?.quantity || 0} items in stock</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Escrow Delivery Fee</span>
                <span className="font-semibold text-slate-800">Ksh {product?.deliveryFee || 0}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <button type="button" className={styles["cart-action-btn"]}>
              Secure Asset Allocation (Buy Now)
            </button>

            {/* 🎯 THE FIX: Render the custom storefront re-pin trigger action button button input fields */}
            {isNetworkAffiliate && (
              <button 
                type="button" 
                onClick={handlePinProduct}
                disabled={isPinning || product?.quantity === 0}
                className="w-full rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 py-3.5 text-xs font-bold uppercase tracking-wider transition disabled:opacity-40"
              >
                {isPinning ? "Adding to Storefront..." : "📌 Pin & Sell In My Network"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
