import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";

const API_URL = import.meta.env.PROD ? "" : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function CheckoutPage() {
  const { state } = useLocation(); // Receives { productId, quantity, affiliateId, product } from navigation context
  const { auth } = useAuth();
  const navigate = useNavigate();
  const loggedInUser = auth?.currentUser;

  // 1. Enforce route boundary limits
  if (!state || !state.product) {
    return <div className="p-8 text-center text-xs text-slate-500">No active checkout session found.</div>;
  }

  const { product, quantity, affiliateId } = state;

  // 2. Initialize localized form states matching schema parameters exactly
  const [shippingDetails, setShippingDetails] = useState({
    fullName: "",
    phoneNumber: "",
    county: "",
    subCounty: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setShippingDetails(prev => ({ ...prev, [name]: value }));
  };

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
      
      // 3. Fire payload with structured nested shippingDetails object
      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: product._id,
          quantity,
          affiliateId,
          shippingDetails // Passes nested: fullName, phoneNumber, county, subCounty
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.reason || "Failed to finalize order pipeline.");
      }

      // Success transition pathway redirecting to user dashboard or success page
      alert(`🎉 Order ${data.order.orderNumber} initiated successfully!`);
      navigate("/my-orders");

    } catch (err) {
      console.error("Checkout submission failure:", err);
      setErrorMsg(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6">Secure Escrow Checkout</h1>
      
      <div className="grid gap-8 md:grid-cols-5">
        {/* SHIPPING FORM DETAILS PANEL (3/5 width) */}
        <form onSubmit={handlePlaceOrder} className="md:col-span-3 space-y-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Delivery Handshake Destination</h2>
          
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-semibold">
              ⚠️ {errorMsg}
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Full Legal Name</label>
            <input 
              type="text" required name="fullName" value={shippingDetails.fullName} onChange={handleInputChange}
              placeholder="e.g. John Doe" className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-emerald-600"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">M-PESA Delivery Phone Number</label>
            <input 
              type="tel" required name="phoneNumber" value={shippingDetails.phoneNumber} onChange={handleInputChange}
              placeholder="e.g. 07XXXXXXXX" className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-emerald-600 font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">County</label>
              <input 
                type="text" required name="county" value={shippingDetails.county} onChange={handleInputChange}
                placeholder="e.g. Kisumu" className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-emerald-600"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Sub-County</label>
              <input 
                type="text" required name="subCounty" value={shippingDetails.subCounty} onChange={handleInputChange}
                placeholder="e.g. Kisumu Central" className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-emerald-600"
              />
            </div>
          </div>

          <button
            type="submit" disabled={isSubmitting}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition mt-4 shadow-sm cursor-pointer"
          >
            {isSubmitting ? "Locking Balances into Escrow..." : `Pay Ksh ${(product.price * quantity + (product.deliveryFee || 0)).toLocaleString()}`}
          </button>
        </form>

        {/* ORDER SUMMARY CART PANEL (2/5 width) */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Item Breakdown</h2>
            <div className="flex items-start space-x-3">
              <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200 flex-shrink-0" />
              <div>
                <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{product.name}</h3>
                <p className="text-xs text-slate-400 font-medium">Qty: {quantity} × Ksh {product.price?.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 text-xs font-medium text-slate-600">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">Ksh {(product.price * quantity).toLocaleString()}</span></div>
              <div className="flex justify-between"><span>Escrow Logistics Fee</span><span className="font-mono">Ksh {(product.deliveryFee || 0).toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 text-sm">
                <span>Total Due</span><span className="font-mono text-emerald-600">Ksh {(product.price * quantity + (product.deliveryFee || 0)).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
