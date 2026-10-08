import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import CheckoutButton from "../../../components/CheckoutButton/CheckoutButton"; // 🎯 IMPORTED NEW SECURE PIPELINE BUTTON

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function ProductDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { auth, userCategory } = useAuth(); // Assuming userCategory is exposed via auth context
  const loggedInUser = auth?.currentUser;

  // Extract affiliate promoter ID if tracking link was used
  const affiliateId = searchParams.get("ref") || null;

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("description");

  useEffect(() => {
    if (id) fetchProductDetails();
  }, [id]);

  const fetchProductDetails = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/products/${id}`);
      const data = await response.json();
      if (response.ok) {
        setProduct(data.feed || data); // Matches your backend object wrapping
      }
    } catch (err) {
      console.error("Failed to load catalog details profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleShelfPinToggle = async () => {
    try {
      const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
      const response = await fetch(`${API_URL}/api/products/${id}/toggle-shelf`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        alert("🏪 Storefront layout shelf positioning updated successfully!");
        fetchProductDetails();
      }
    } catch (err) {
      console.error("Failed to execute toggle pin:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <div className="w-8 h-8 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-12 text-slate-500 text-xs">
        The requested product catalog asset could not be found.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 md:grid-cols-2">
        
        {/* PRODUCT VISUAL IMAGE RENDER */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 overflow-hidden shadow-xs h-96 flex items-center justify-center">
          <img 
            src={product.imageUrl || "https://unsplash.com"} 
            alt={product.name} 
            className="max-h-full max-w-full object-contain rounded-xl"
          />
        </div>

        {/* METRICS & TRANSACTION CONTROL SELECTIONS */}
        <div className="flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">{product.name}</h1>
            
            {/* PRICING INDICATOR DISPLAY */}
            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-3xl font-black text-emerald-600 tracking-tight">Ksh {product.price?.toLocaleString()}</span>
              {product.deliveryFee > 0 && (
                <span className="text-xs text-slate-400 font-medium">+ Ksh {product.deliveryFee} delivery</span>
              )}
            </div>

            {/* VENDOR CONTROL STRIP */}
            {userCategory === "network" && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Network Commission Margin</span>
                  <span className="text-sm font-bold text-emerald-700">+Ksh {product.affiliateCommission?.toLocaleString()} per sale</span>
                </div>
                <button
                  onClick={handleShelfPinToggle}
                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  📌 {product.isShelved ? "Unpin from Shelf" : "Pin to Storefront"}
                </button>
              </div>
            )}

            {/* QUANTITY CONFIGURE CONTROL PICKER */}
            <div className="mt-6 flex items-center space-x-4 border-t border-slate-100 pt-6">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity:</span>
              <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                <button 
                  onClick={() => setQuantity(q => Math.max(1, q - 1))}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold border-r border-slate-200"
                >
                  -
                </button>
                <span className="px-4 text-sm font-mono font-bold text-slate-800">{quantity}</span>
                <button 
                  onClick={() => setQuantity(q => Math.min(product.quantity || 10, q + 1))}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold border-l border-slate-200"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-400 font-semibold">({product.quantity || 0} pieces remaining in warehouse)</span>
            </div>
          </div>

          {/* DYNAMIC INTEGRATED ESCROW CHECKOUT ACTIONS HOOK PANEL */}
          <div className="mt-8 border-t border-slate-100 pt-6">
            <CheckoutButton 
              productId={product._id} 
              quantity={quantity} 
              affiliateId={affiliateId}
              onOrderSuccess={() => setQuantity(1)}
            />
          </div>
        </div>
      </div>

      {/* METADATA INFORMATIONAL TAB BAR MATRICES */}
      <div className="mt-12 border-t border-slate-200 pt-8">
        <div className="flex space-x-4 border-b border-slate-200 pb-px">
          <button
            onClick={() => setActiveTab("description")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === "description" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Product Info
          </button>
          {userCategory === "network" && (
            <button
              onClick={() => setActiveTab("network")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                activeTab === "network" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              🤝 Shared Store Metrics
            </button>
          )}
        </div>

        <div className="mt-6 text-sm text-slate-600 leading-relaxed max-w-3xl">
          {activeTab === "description" ? (
            <p>{product.description || "No specific detailed description logging provided by merchant catalog entries."}</p>
          ) : (
            <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-700">Vendor Accounting Summary Mapping:</p>
              <ul className="text-xs space-y-1.5 font-medium text-slate-500 list-disc list-inside">
                <li>Wholesale cost to shop base: <span className="font-mono text-slate-800 font-bold">Ksh {product.price - product.affiliateCommission}</span></li>
                <li>Calculated conversion multiplier rate: <span className="text-slate-800 font-bold">{(product.metrics?.conversionRate || 0) * 100}%</span></li>
                <li>Tracked MLM global network shares: <span className="text-slate-800 font-bold">{product.metrics?.referralCount || 0} referrals</span></li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
