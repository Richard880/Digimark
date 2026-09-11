import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import styles from "./ProductDetails.module.css";

export default function ProductDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

 // Inside your frontend ProductDetails.jsx component file, update the fetch link inside useEffect:
useEffect(() => {
  if (!id) return;

  const fetchDetails = async () => {
    try {
      setIsLoading(true);
      
      // 🎯 FIXED PATH: Targets the newly isolated product details backend router file path
      const response = await fetch(`http://localhost:3000/api/product-details/${id}`);
      
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


  const handleBackNavigation = () => {
    // Falls back gracefully to your MarketHub route
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

  // Parse image directories matching your system mechanics 
  const fileName = (product?.imageUrl || "").split("/").pop();
  const fullImageUrl = `http://localhost:3000/images/${fileName}`;

  return (
    <div className={styles["details-shell"]}>
      {/* Dynamic Back Utility button */}
      <button type="button" onClick={handleBackNavigation} className={styles["back-action-anchor"]}>
        <svg xmlns="http://w3.org" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>Back to MarketHub</span>
      </button>

      {/* Primary Structural Frame */}
      <div className={styles["details-container"]}>
        
        {/* Left Side Section: Interactive Showcase Canvas */}
        <div className={styles["image-canvas-side"]}>
          {product?.fromNetwork && (
            <span className="absolute top-4 left-4 z-10 px-3 py-1 rounded-md text-[px] font-extrabold tracking-wide uppercase bg-blue-600 text-white shadow-xs">
              My Network Connection
            </span>
          )}
          <img 
            src={fullImageUrl} 
            alt={product?.name || "Inventory Item"} 
            onError={(e) => { e.target.src = 'https://unsplash.com'; }}
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
              <span className="text-xs text-slate-400 font-medium">Wholesale Pricing Structure</span>
              <span className={styles["price-readout"]}>
                Ksh {parseFloat(product?.price || 0).toLocaleString()}
              </span>
            </div>

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

          <button type="button" className={styles["cart-action-btn"]}>
            Secure Asset Allocation
          </button>
        </div>

      </div>
    </div>
  );
}
