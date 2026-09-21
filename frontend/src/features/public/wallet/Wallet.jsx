import { useEffect, useState } from "react";
import styles from "./Wallet.module.css"; // Optional: Use standard style maps or Tailwind utilities

// Dynamic URL router parsing
const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function Wallet() {
  const [walletDetails, setWalletDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Load balances and transaction notifications list on mount
  useEffect(() => {
    fetchWalletDetails();
  }, []);

  const fetchWalletDetails = async () => {
    try {
      setIsLoading(true);
      // Replace with your global storage token fetch logic from AuthContext or localStorage
      const token = localStorage.getItem("authToken"); 
      const response = await fetch(`${API_URL}/api/wallet/my-balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.ok) {
        setWalletDetails(data);
      }
    } catch (err) {
      console.error("Failed to load wallet metrics profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawalRequest = async (e) => {
    e.preventDefault();
    const amount = Number(withdrawAmount);
    if (!amount || amount <= 0) return alert("Please specify a valid withdrawal amount.");

    setIsProcessing(true);
    try {
      const token = localStorage.getItem("authToken");
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
        fetchWalletDetails(); // Refresh balances list
      } else {
        alert(data.reason || "Withdrawal failed due to insufficient funds.");
      }
    } catch (err) {
      console.error("Withdrawal network connection fault:", err);
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <p className="text-xs font-bold text-slate-400 animate-pulse tracking-wider uppercase">Hydrating secure ledger balance sheet...</p>
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

        {/* EXPRESS WITHDRAWAL UTILITY QUICK FORM CARD */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-800 shadow-sm sm:col-span-2 lg:col-span-1">
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-2">Express Cash-Out Outflow</span>
          <form onSubmit={handleWithdrawalRequest} className="flex gap-2">
            <input
              type="number"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              disabled={isProcessing || walletDetails?.isFrozen}
              placeholder="Amount (KES)..."
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={isProcessing || walletDetails?.isFrozen || !withdrawAmount}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2 transition disabled:opacity-40"
            >
              {isProcessing ? "Processing..." : "Withdraw"}
            </button>
          </form>
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
                key={txn.transactionId} 
                className="flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition"
              >
                {/* Visual Status Indicator Icon Circles */}
                <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold shadow-xs ${
                  txn.amount > 0 ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"
                }`}>
                  {txn.amount > 0 ? "＋" : "⎼"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <h4 className="text-sm font-bold text-slate-800 leading-none capitalize">
                      {txn.type.replace("_", " ")}
                    </h4>
                    <span className={`text-xs font-black tracking-tight ${txn.amount > 0 ? "text-emerald-600" : "text-slate-800"}`}>
                      {txn.amount > 0 ? "+" : ""}Ksh {txn.amount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{txn.description}</p>
                  
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400 font-medium">
                    <span className="font-mono uppercase">{txn.transactionId}</span>
                    <span>•</span>
                    <span>{new Date(txn.createdAt).toLocaleString("en-KE")}</span>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide ${
                    txn.status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : 
                    txn.status === "ESCROW_HELD" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {txn.status === "COMPLETED" ? "Success" : txn.status.replace("_", " ")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-xs">
            No logged transaction receipts or notifications found in your wallet history ledger sheet yet.
          </div>
        )}
      </div>

    </div>
  );
}
