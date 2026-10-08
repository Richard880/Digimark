import { useState } from "react";
import useAuth from "../../features/auth/hooks/useAuth";

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function CheckoutButton({ productId, quantity = 1, affiliateId = null, onOrderSuccess }) {
  const { auth } = useAuth();
  const loggedInUser = auth?.currentUser;

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isTopUpProcessing, setIsTopUpProcessing] = useState(false);
  const [mpesaDeficit, setMpesaDeficit] = useState(null);

  // =========================================================================
  // 🛒 PRIMARY ATOMIC ESCROW CHECKOUT HANDLER
  // =========================================================================
  const handleCheckout = async () => {
    if (!loggedInUser) {
      return alert("🔒 Authentication required: Please log in to complete your checkout.");
    }

    setIsCheckingOut(true);
    setMpesaDeficit(null);

    try {
      // 1. Extract dynamic Firebase JWT authorization signature token
      const token = loggedInUser.getIdToken ? await loggedInUser.getIdToken() : null;
      if (!token) throw new Error("Your secure session signature has expired.");

      // 2. Transmit checkout dynamic payload arrays to the backend pipeline
      const response = await fetch(`${API_URL}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          productId,
          quantity,
          affiliateId,
          shippingDetails: {
            location: "Kisumu, Main Stage Terminal Hub", // Fallback text input or linked profile data
            notes: "Deliver securely via logistics courier partners."
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`🎉 Escrow Transaction Locked! Order initialized successfully.\n\n🚚 Give this Release PIN to your courier upon delivery verification: ${data.order.deliveryReleasePin}`);
        if (onOrderSuccess) onOrderSuccess(data.order);
      } else if (response.status === 402 && data.reason === "INSUFFICIENT_FUNDS") {
        // 💰 INTERCEPT DEFICIT BALANCE WARNINGS
        setMpesaDeficit({
          errorMsg: data.error,
          deficitAmount: data.deficit
        });
      } else {
        alert(data.reason || data.error || "Checkout failed due to transactional error.");
      }
    } catch (err) {
      console.error("❌ Checkout operational pipe fault:", err);
      alert(err.message || "Network connection failure. Escrow balance handshake rejected.");
    } finally {
      setIsCheckingOut(false);
    }
  };

  // =========================================================================
  // 📲 DYNAMIC INLINE M-PESA STK PUSH BACKUP TOP-UP
  // =========================================================================
  const handleDeficitTopUp = async () => {
    if (!mpesaDeficit) return;
    setIsTopUpProcessing(true);

    try {
      const token = loggedInUser.getIdToken ? await loggedInUser.getIdToken() : null;
      if (!token) throw new Error("Your secure session signature has expired.");

      // Automatically fire STK Push for the exact missing amount rounded up cleanly
      const topUpTarget = Math.ceil(mpesaDeficit.deficitAmount);

      const response = await fetch(`${API_URL}/api/wallet/mpesa-topup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount: topUpTarget })
      });

      const data = await response.json();

      if (response.ok) {
        alert(`📲 STK Push initialized for Ksh ${topUpTarget.toLocaleString()}!\n\nEnter your M-PESA PIN on your mobile screen window prompt, then retry checkout once verified.`);
        setMpesaDeficit(null); // Clear prompt state array logs cleanly
      } else {
        alert(data.error || "Safaricom M-PESA service gateway rejected connection parameters.");
      }
    } catch (err) {
      console.error("❌ M-PESA callback injection error:", err);
      alert(err.message || "Failed to route express handset handshake request parameters.");
    } finally {
      setIsTopUpProcessing(false);
    }
  };

  return (
    <div className="w-full flex flex-col space-y-3">
      {/* STANDARD CHECKOUT STATE CTA BUTTON CONTAINER */}
      {!mpesaDeficit ? (
        <button
          onClick={handleCheckout}
          disabled={isCheckingOut || !productId}
          className="w-full py-3 px-6 text-sm font-bold text-white uppercase tracking-wider rounded-xl bg-slate-900 hover:bg-slate-800 transition disabled:opacity-40 shadow-xs flex items-center justify-center space-x-2"
        >
          {isCheckingOut ? (
            <>
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              <span>Securing Escrow Space...</span>
            </>
          ) : (
            <span>Secure Marketplace Checkout</span>
          )}
        </button>
      ) : (
        /* DYNAMIC SAFARICOM STK INTERCEPT PANEL FOR WALLET BALANCING INSUFFICIENT BLOCKERS */
        <div className="p-4 rounded-xl border border-amber-100 bg-amber-50/60 text-slate-800 flex flex-col space-y-3 animate-fade-in">
          <div className="flex items-start space-x-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-900 leading-tight">Insufficient Ledger Funds Balance</p>
              <p className="text-[11px] text-amber-700 mt-1 leading-normal">
                {mpesaDeficit.errorMsg || "Your account balance cannot cover this escrow deposit configuration."}
              </p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handleDeficitTopUp}
              disabled={isTopUpProcessing}
              className="flex-1 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold tracking-wide uppercase transition shadow-xs disabled:opacity-50"
            >
              {isTopUpProcessing ? "Pushing Handset STK..." : `📲 Deposit Ksh ${Math.ceil(mpesaDeficit.deficitAmount).toLocaleString()} via M-PESA`}
            </button>
            <button
              onClick={() => setMpesaDeficit(null)}
              disabled={isTopUpProcessing}
              className="py-2 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 text-[11px] font-bold tracking-wide uppercase transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
