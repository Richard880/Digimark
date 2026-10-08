import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader"; 
import AddProductModal from "./AddProductModal"; 
import styles from "./MyShopDashboard.module.css"; 

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function MyShopDashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();

  const [activeTab, setActiveTab] = useState("inventory");
  const [allProducts, setAllProducts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pinInputs, setPinInputs] = useState({}); 

  useEffect(() => {
    const fetchShopData = async () => {
      try {
        setIsLoading(true);
        const token = await auth?.currentUser?.getIdToken();
        const resolvedSellerId = 
          auth?.user?.id || 
          auth?.user?._id || 
          auth?.profile?.id || 
          auth?.profile?._id || 
          auth?.currentUser?.uid;
        if (!resolvedSellerId) return;

        // 1. Fetch Inventory Safely
        const prodRes = await fetch(`${API_URL}/api/products?sellerId=${resolvedSellerId}&status=all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          const inventoryArray = prodData?.feed || prodData || [];
          setAllProducts(Array.isArray(inventoryArray) ? inventoryArray : []);
        }

        // 2. Fetch Orders Safely
        const orderRes = await fetch(`${API_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          const ordersArray = orderData?.orders || orderData?.feed || orderData || [];
          setSalesOrders(Array.isArray(ordersArray) ? ordersArray : []);
        }
      } catch (err) {
        console.error("Dashboard backend hydration exception:", err);
      } finaly {
        setIsLoading(false);
      }
    };

    if (auth?.currentUser) fetchShopData();
  }, [auth, activeTab]);

  const handleToggleShelfPlacement = async (productId) => {
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${API_URL}/api/products/${productId}/toggle-shelf`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const responseData = await response.json();
        setAllProducts(prev =>
          prev.map(p => (p._id === productId ? responseData.product : p))
        );
      }
    } catch (err) {
      console.error("Failed to alter shelf state layout:", err);
    }
  };

  const handleVerifyDeliveryPin = async (orderNumber) => {
    const code = pinInputs[orderNumber];
    if (!code || code.trim().length !== 6) return alert("Please type a valid 6-digit PIN code.");
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${API_URL}/api/orders/verify-release-pin`, {
        method: "PATCH",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ orderNumber, providedPin: code })
      });
      const data = await response.json();
      if (response.ok) {
        alert("🎉 Pin verification successful! Funds released to your available balance.");
        setSalesOrders(prev => prev.map(o => o.orderNumber === orderNumber ? { ...o, orderStatus: "DELIVERED" } : o));
      } else {
        alert(data.reason || "Invalid code value signature entered.");
      }
    } catch (err) {
      console.error("Escrow key verification boundary exception:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans antialiased text-slate-600">
      
      {/* 🧭 SIDEBAR PANEL NAVIGATION */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed inset-y-0 left-0 z-40 shadow-xl border-r border-slate-800">
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            🚀 Soko<span className="text-emerald-400">Digi</span>
          </h1>
          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">PRO</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
          <button 
            onClick={() => setActiveTab("inventory")} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "inventory" 
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10" 
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            📦 Warehouse Inventory
          </button>
          
          <button 
            onClick={() => setActiveTab("orders")} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
              activeTab === "orders" 
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/10" 
                : "text-slate-400 hover:bg-slate-800/60 hover:text-white"
            }`}
          >
            📋 Sales Orders
          </button>

          <div className="pt-4 border-t border-slate-800/60 mt-4">
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-bold transition duration-200 shadow-sm cursor-pointer"
            >
              ➕ List New Asset
            </button>
          </div>
        </nav>

        {/* MERCHANT ACCOUNT CARD FOOTER */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-emerald-400">
            {auth?.profile?.displayName?.charAt(0).toUpperCase() || "M"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{auth?.profile?.brandName || "Active Merchant"}</p>
            <p className="text-[10px] text-slate-500 truncate">{auth?.currentUser?.email}</p>
          </div>
        </div>
      </aside>

      {/* 💻 MAIN WORKSPACE CONTENT CONTAINER */}
      <main className="flex-1 pl-64 min-w-0">
        
        {/* WHITE FLOATING ACTION HEADER BAR */}
        <header className="h-16 bg-white border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dashboard Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              {activeTab === "inventory" ? "Warehouse Stock" : "Escrow Sales Log"}
            </span>
          </div>
          <div className="text-xs text-slate-400 font-medium">
            System Status: <span className="text-emerald-500 font-bold inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Operational</span>
          </div>
        </header>

        {/* ACTION WORKSPACE WRAPPER */}
        <div className="p-8 max-w-7xl mx-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-32 space-y-3 bg-white border border-slate-200/60 rounded-2xl shadow-xs">
              <div className="w-8 h-8 border-4 border-emerald-500/20 border-t-emerald-600 rounded-full animate-spin"></div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Hydrating SokoDigi ledger data...</p>
            </div>
          ) : (
            <div className="space-y-6">
              
           {/* SECTION A: WAREHOUSE INVENTORY LISTING RENDER LOOP */}
{activeTab === "inventory" && (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden">
    <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
      <div>
        <h2 className="text-base font-bold text-slate-800">Stock Registry</h2>
        <p className="text-xs text-slate-400 mt-0.5">Manage listed market catalog streams and shelf placements.</p>
      </div>
      <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200/40">
        Total Items: {allProducts?.length || 0}
      </span>
    </div>

    {!allProducts || allProducts.length === 0 ? (
      <div className="p-16 text-center">
        <p className="text-sm font-bold text-slate-700">Your stockroom is empty</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Click 'List New Asset' to publish products directly to the MarketHub grid feed.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-4 pl-6">Product Details</th>
              <th className="p-4">SKU / Code</th>
              <th className="p-4">Retail Price</th>
              <th className="p-4">Network Comm</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
            {allProducts.map((product, idx) => (
              <tr key={product.id || idx} className="hover:bg-slate-50/50 transition">
                <td className="p-4 pl-6 font-bold text-slate-900">{product.name || "Unnamed Asset"}</td>
                <td className="p-4 font-mono text-slate-500">{product.productCode || "N/A"}</td>
                <td className="p-4">KES {product.price?.toLocaleString() || 0}</td>
                <td className="p-4 text-emerald-600">KES {product.affiliateCommission?.toLocaleString() || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}

{/* SECTION B: SALES AND PIN ESCROW TRANSACTION RENDER LOOP */}
{activeTab === "orders" && (
  <div className="bg-white rounded-2xl border border-slate-200/60 shadow-xs overflow-hidden">
    <div className="p-6 border-b border-slate-100 bg-slate-50/50">
      <h2 className="text-base font-bold text-slate-800">Escrow Sales Ledgers</h2>
      <p className="text-xs text-slate-400 mt-0.5">Input customer clearance confirmation keys to unlock pending balances.</p>
    </div>

    {!salesOrders || salesOrders.length === 0 ? (
      <div className="p-16 text-center">
        <p className="text-sm font-bold text-slate-700">No transactions recorded</p>
        <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">When promoters secure orders across the social channels, matching entries deploy right here.</p>
      </div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <th className="p-4 pl-6">Order ID</th>
              <th className="p-4">Customer Base</th>
              <th className="p-4">Escrow Value</th>
              <th className="p-4">Status</th>
              <th className="p-4 pr-6 text-right">Clearance Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
            {salesOrders.map((order, idx) => (
              <tr key={order.id || idx} className="hover:bg-slate-50/50 transition">
                <td className="p-4 pl-6 font-mono text-slate-900">#{order.orderNumber || "0000"}</td>
                <td className="p-4">{order.customerName || "Direct Consumer"}</td>
                <td className="p-4 font-bold text-slate-900">KES {order.totalPrice?.toLocaleString() || 0}</td>
                <td className="p-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    order.orderStatus === "DELIVERED" 
                      ? "bg-emerald-100 text-emerald-800 border border-emerald-200" 
                      : "bg-amber-100 text-amber-800 border border-amber-200"
                  }`}>
                    {order.orderStatus || "PENDING"}
                  </span>
                </td>
                <td className="p-4 pr-6 text-right">
                  {order.orderStatus === "DELIVERED" ? (
                    <span className="text-emerald-500 text-[11px] font-bold">✓ Cleared to Vault</span>
                  ) : (
                    <button className="px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-lg text-[11px] transition shadow-xs">
                      Release Funds
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
)}

{/* 🚀 TWO-TIER COMPONENT MODAL MODULAR BLOCK INSIGHT */}
<AddProductModal
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  onSuccess={(newProduct) => {
    setAllProducts(prev => [newProduct, ...prev]);
  }}
  uploadImageToCloudinary={uploadImageToCloudinary}
/>
