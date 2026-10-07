import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth"; 
import styles from "./ProductDetails.module.css";

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { auth } = useAuth(); 

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isPinning, setIsPinning] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  useEffect(() => {
    if (!id) return;

    const fetchDetails = async () => {
      try {
        setIsLoading(true);
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

  const handleSecureAssetAllocation = async () => {
    if (!auth?.currentUser) {
      alert("Please log into your account to securely purchase assets from MarketHub.");
      return;
    }

    if (!window.confirm(`Initialize Escrow Contract for ${product?.name}? Funds will be held until delivery scan/pin handshake completion.`)) return;

    setIsCheckingOut(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      
      const checkoutPayload = {
        productId: id,
        quantity: 1,
        shippingDetails: {
          fullName: auth?.profile?.brandName || "SokoDigi Client Customer",
          county: "Kisumu",
          subCounty: "Kisumu Central"
        }
      };

      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(checkoutPayload)
      });

      const data = await response.json();
      if (response.ok) {
        alert(`🎉 Escrow Transaction Initialized! Secure Order: ${data.order?.orderNumber || "SDO-PRO"}`);
        navigate("/profile");
      } else {
        alert(data.reason || data.error || "Failed to process escrow asset checkout.");
      }
    } catch (err) {
      console.error("Order checkpoint synchronization error:", err);
      alert("Network connectivity issue. Unable to establish escrow ledger contract.");
    } finally {
      setIsCheckingOut(false);
    }
  };

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
        navigate("/profile"); 
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

  const handleBackNavigation = () => navigate("/marketplace");

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center space-y-4 min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 animate-pulse">Resolving Item Parameters...</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className={styles["error-wrapper"]}>
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center font-bold mb-3 border border-red-100">!</div>
        <h3 className="text-base font-bold text-slate-800">Inventory Error</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">{errorMsg}</p>
        <button type="button" onClick={handleBackNavigation} className="mt-4 px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg">Back to Hub</button>
      </div>
    );
  }

  const isNetworkAffiliate = auth?.profile?.accountCategory === "network" || auth?.user?.accountCategory === "network";
  const retailPrice = Number(product?.price || 0);
  const commission = Number(product?.affiliateCommission || 0);
  const resellerCost = retailPrice - commission;

  return (
    <div className={styles["details-shell"]}>
      {/* 🧭 NAVIGATION BACK-ANCHOR */}
      <button type="button" onClick={handleBackNavigation} className={styles["back-action-anchor"]}>
        <svg xmlns="http://w3.org" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to MarketHub</span>
      </button>

      {/* 🎛️ TWO-COLUMN CORE WORKSPACE PANEL CONTAINER */}
      <div className={styles["details-container"]}>
        
        {/* LEFT COLUMN: HERO VISUAL CANVAS */}
        <div className={styles["image-canvas-side"]}>
          <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-slate-900 text-white tracking-wider border border-white/10 shadow-sm">
              🛡️ SokoDigi Verified
            </span>
            {product?.fromNetwork && (
              <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase bg-blue-600 text-white tracking-wider shadow-sm">
                Connected Core Connection
              </span>
            )}
          </div>
          
          <img 
            src={product?.imageUrl || "https://unsplash.com"} 
            crossOrigin="anonymous" 
            alt={product?.name || "Inventory Item"} 
            onError={(e) => { e.currentTarget.src = 'https://unsplash.com'; }}
          />
        </div>

        {/* RIGHT COLUMN: CORE COMMERCE ACTIONS & DATA SPEC SHEET */}
        <div className={styles["meta-content-side"]}>
          <div className="space-y-2">
            <span className={styles["category-tag"]}>
              {product?.category || "General Catalog"}
            </span>
            <h1 className={styles["product-headline"]}>
              {product?.name || "Premium Inventory Spec Asset"}
            </h1>
            <p className={styles["vendor-text"]}>
              Sourcing Hub: <strong>{product?.brandName || "Independent Supplier"}</strong>
            </p>
          </div>

          {/* ⭐⭐⭐⭐⭐ SOCIAL RATINGS COMPONENT REPLICA */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl w-max mt-4">
            <div className="flex text-amber-400 text-xs tracking-tighter">★★★★★</div>
            <span className="text-[11px] font-black text-slate-700">4.9 Rating</span>
            <span className="text-slate-200 text-xs">|</span>
            <span className="text-[11px] font-bold text-slate-400">Verified Dispatch</span>
          </div>

          {/* 💰 HIGH-DENSITY SPLIT-ACCOUNTING FINANCIAL MATRIX ROW */}
          <div className="my-6 space-y-4 border-y border-slate-100 py-5">
            <div className={styles["price-tag-row"]}>
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Customer Retail Value</span>
              <span className={styles["price-readout"]}>
                KSh {retailPrice.toLocaleString()}
              </span>
            </div>

            {/* HIGH-CONTRAST COMMISSION HIGHLIGHT SHEET (FOR MARKETERS ONLY) */}
            {isNetworkAffiliate && commission > 0 && (
              <div className="grid grid-cols-2 gap-2 bg-gradient-to-br from-amber-400/10 to-amber-500/5 border border-amber-200/60 p-3.5 rounded-2xl">
                <div>
                  <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">Your Reseller Cost</span>
                  <span className="text-base font-black text-slate-800">KSh {resellerCost.toLocaleString()}</span>
                </div>
                <div className="text-right border-l border-amber-200/40 pl-2">
                  <span className="block text-[9px] uppercase font-bold text-amber-700 tracking-wider">Direct Share Reward</span>
                  <span className="text-base font-black text-amber-600">KSh {commission.toLocaleString()}</span>
                </div>
              </div>
            )}

                    {/* LOWER METADATA SPECIFICATIONS STRIP */}
                       {/* LOWER METADATA SPECIFICATIONS STRIP */}
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-600 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Warehouse Stock</span>
                <span className={product?.quantity > 0 ? "text-slate-800 font-black" : "text-red-600 font-black"}>
                  {product?.quantity > 0 ? `${product.quantity} units available` : "Out of Stock"}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider mb-0.5">Escrow Courier Fee</span>
                <span className="font-black text-slate-800">
                  KSh {Number(product?.deliveryFee || 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* PRODUCT DESCRIPTION OVERVIEW PANEL */}
            <div className="space-y-1.5 pt-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">Product Overview</span>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                {product?.description || "This verified inventory asset meets all SokoDigi quality assurance guidelines. Funds remain secured safely within escrow until delivery handshake confirmation."}
              </p>
            </div>

          </div> {/* CLOSES THE METADATA SPECIFICATION CONTAINER STRIP */}

          {/* 🎯 ACTION TRANSACTION BUTTON ROUTER KEYS */}
          <div className="space-y-2 mt-4">
            <button
              type="button"
              onClick={handleSecureAssetAllocation}
              disabled={isCheckingOut || !product?.quantity}
              className={styles["cart-action-btn"]}
            >
              {isCheckingOut ? "Compiling Escrow Balance Signature..." : "Secure Asset Allocation (Buy Now)"}
            </button>

            {isNetworkAffiliate && (
              <button
                type="button"
                onClick={handlePinProduct}
                disabled={isPinning}
                className="w-full rounded-xl border-2 border-dashed border-emerald-200 hover:border-emerald-500 bg-emerald-50/30 text-emerald-800 font-extrabold text-xs py-3.5 text-center transition disabled:opacity-40 uppercase tracking-widest"
              >
                {isPinning ? "Pinning Storefront Matrix..." : "📌 Pin Product to Storefront"}
              </button>
            )}
          </div>

        </div> {/* CLOSES META-CONTENT-SIDE */}
      </div> {/* CLOSES DETAILS-CONTAINER */}
    </div> {/* CLOSES DETAILS-SHELL */}
