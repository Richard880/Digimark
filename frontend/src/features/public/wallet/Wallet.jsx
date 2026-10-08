import { useEffect, useState } from "react";
import styles from "./Wallet.module.css";
import useAuth from "../../auth/hooks/useAuth";

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function Wallet() {
  const { auth } = useAuth();
  const loggedInUser = auth?.currentUser;

  const [walletDetails, setWalletDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [topUpAmount, setTopUpAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTopUpProcessing, setIsTopUpProcessing] = useState(false);

  useEffect(() => {
    if (loggedInUser) {
      fetchWalletDetails();
    } else {
      setIsLoading(false); 
    }
  }, [loggedInUser]);

  const fetchWalletDetails = async () => {
    try {
      setIsLoading(true);
      const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
      if (!token) return;

      const response = await fetch(`${API_URL}/api/wallet/my-balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (response.ok) {
        setWalletDetails(data);
      }
    } catch (err) {
      console.error("Failed to load wallet metrics profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  // =========================================================================
  // 📲 SAFARICOM M-PESA DARAJA STK PUSH INTERFACE TOP-UP
  // =========================================================================
  const handleMpesaTopUpRequest = async (e) => {
    e.preventDefault();
    const amount = Number(topUpAmount);
    if (!amount || amount < 10) return alert("Minimum M-PESA transaction top-up amount is Ksh 10.");

    setIsTopUpProcessing(true);
    try {
      const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
      if (!token) throw new Error("Your authentication session has expired.");

      const response = await fetch(`${API_URL}/api/wallet/mpesa-topup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });

      const data = await response.json();
      if (response.ok) {
        alert("📲 STK Push initialized! Check your handset for the M-PESA PIN prompt window to confirm deposit allocation.");
        setTopUpAmount("");
        
        // Polling interval delay loop to refresh available liquid ledger figures cleanly
        setTimeout(() => fetchWalletDetails(), 6000);
      } else {
        alert(data.error || data.reason || "M-PESA STK connection handshake rejected.");
      }
    } catch (err) {
      console.error("Top-Up connection breakdown caught:", err);
      alert(err.message || "Failed to initialize Safaricom billing engine transaction parameters.");
    } finally {
      setIsTopUpProcessing(false);
    }
  };

  const handleWithdrawalRequest = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) return alert("Please specify a valid withdrawal amount.");

    setIsProcessing(true);
    try {
      const token = loggedInUser?.getIdToken ? await loggedInUser.getIdToken() : null;
      if (!token) throw new Error("Your authentication session has expired.");

      const response = await fetch(`${API_URL}/api/wallet/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ amount })
      });
      
      const data = await response.json();
      if (response.ok) {
        alert("💸 Withdrawal request successfully initialized to your personal M-PESA line!");
        setWithdrawAmount("");
        fetchWalletDetails();
      } else {
        alert(data.reason || "Withdrawal failed due to insufficient funds.");
      }
    } catch (err) {
      console.error("Withdrawal network connection fault:", err);
      alert(err.message || "Something went wrong processing your request.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin"></div>
          <p className="text-xs font-bold text-slate-400 animate-pulse tracking-wider uppercase">Hydrating secure ledger balance sheet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      
      {/* HEADER SECTION PANEL */}
      <div className="mb-8 border-b border-slate-200 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My Financial Wallet</h1>
        <p className="mt-2 text-sm text-slate-500">Track your available balances, manage escrow payouts, and execute payouts straight to your phone line.</p>
      </div>

      {/* BALANCE READOUT METRIC CONTAINER CARDS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        
        {/* LIVE AVAILABLE CARD BALANCE */}
        <div className="rounded-2xl border border-emerald-100 bg-emerald-600 p-6 text-white shadow-sm relative overflow-hidden">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider opacity-80">Available Liquid Funds</span>
          <span className="block text-3xl font-black mt-2 tracking-tight">Ksh {walletDetails?.balance?.toLocaleString() || "0.00"}</span>
          <span className="block text-[10px] bg-emerald-500/40 rounded-md py-1 px-2.5 w-max font-semibold mt-4">✓ Verified Safe Storage</span>
        </div>

        {/* LOGISTICS ESCROW BALANCES COUNTER CARD */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-sm relative overflow-hidden">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Escrow Locked Balances</span>
          <span className="block text-3xl font-black mt-2 text-slate-900 tracking-tight">Ksh {walletDetails?.escrowBalance?.toLocaleString() || "0.00"}</span>
          <p className="text-[10px] text-slate-400 mt-4 leading-normal">Held secure until consumers confirm successful package receipt.</p>
        </div>

        {/* INTERACTION MATRIX CARD HOUSING DUAL UTILITIES */}
        <div className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
          {/* M-PESA STK TOP UP INPUT COMPONENT ELEMENT */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">📲 M-PESA Instant STK Top-Up</span>
            <form onSubmit={handleMpesaTopUpRequest} className="flex gap-2">
              <input
                type="number"
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                disabled={isTopUpProcessing}
                placeholder="Amount (KES)..."
                className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isTopUpProcessing || !topUpAmount}
                className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold px-3 py-1.5 transition disabled:opacity-40"
              >
                {isTopUpProcessing ? "Pushing..." : "Top-Up"}
              </button>
            </form>
          </div>

          {/* EXPRESS WITHDRAWAL UTILITY QUICK FORM COMPONENT */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm">
            <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">💸 Express Cash-Out Outflow</span>
            <form onSubmit={handleWithdrawalRequest} className="flex gap-2">
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isProcessing || walletDetails?.isFrozen}
                placeholder="Amount (KES)..."
                className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isProcessing || walletDetails?.isFrozen || !withdrawAmount}
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold px-3 py-1.5 transition disabled:opacity-40"
              >
                {isProcessing ? "Processing..." : "Withdraw"}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* IMMUTABLE TRANSACTION JOURNAL HISTORY RECEIPTS NOTIFICATIONS FEED LIST */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          🔔 Real-Time Transaction Notifications
        </h2>

        {walletDetails?.transactions?.length > 0 ? (
          <div className="space-y-4">
            {walletDetails.transactions.map((txn) => (
              <div 
                key={txn.transactionId || txn._id} 
                className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition"
              >
                {/* Visual Status Indicator Icon Circles */}
                {/* Visual Transaction Status Pill Badge */}
                <div className="shrink-0 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                    txn.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : 
                    txn.status === "ESCROW_HELD" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {txn.status === "COMPLETED" ? "Success" : txn.status?.replace("_", " ") || "Pending"}
                  </span>
                </div>

              </div> // 🎯 CLOSES INDIVIDUAL TXN ITEM LOOP CARD
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-xs">
            No logged transaction receipts or notifications found in your wallet history ledger sheet yet.
          </div>
        )}
      </div>

    </div> // 🎯 CLOSES MAIN WORKSPACE SHELL WRAPPER CONTAINER
  );
}
