import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader"; 
import AddProductModal from "./AddProductModal"; // 🎯 IMPORT THE NEWLY MODULARIZED TWO-TIER FORM MODAL
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

  // Synchronize data: fetch inventory and orders cleanly
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
      } finally {
        setIsLoading(false);
      }
    };

    if (auth?.currentUser) fetchShopData();
  }, [auth, activeTab]);

  // Toggle shelf state
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

  // Verify purchase PIN
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
    <div className={styles["dashboard-layout"]}>
      {/* Sidebar Panel Navigation */}
      <aside className={styles["sidebar-panel"]}>
        <div className={styles["brand-row"]}>
          <h1 className={styles["brand-title"]}>myShop <span className={styles["brand-accent"]}>Pro</span></h1>
        </div>
        <nav className={styles["nav-menu"]}>
          {/* 🎯 FIXED & CLOSED: Clean sidebar button options layout structures */}
          <button 
            onClick={() => setActiveTab("inventory")} 
            className={`${styles["nav-link"]} ${activeTab === "inventory" ? styles["nav-active"] : ""}`}
          >
            📦 Warehouse Inventory
          </button>
          <button 
            onClick={() => setActiveTab("orders")} 
            className={`${styles["nav-link"]} ${activeTab === "orders" ? styles["nav-active"] : ""}`}
          >
            📋 Sales Orders
          </button>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className={styles["add-product-shortcut"]}
          >
            ➕ List New Asset
          </button>
        </nav>
      </aside>

      {/* Main Content Workspace Layout Viewports */}
      <main className={styles["main-workspace"]}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64 text-sm text-slate-400">Hydrating SokoDigi ledger data...</div>
        ) : (
          <div className="space-y-6">
            {activeTab === "inventory" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h2 className="text-base font-bold text-slate-800 mb-4">Stock Registry ({allProducts.length})</h2>
                {/* Your existing product loop table rows template logic can sit right here */}
              </div>
            )}
            
            {activeTab === "orders" && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-xs">
                <h2 className="text-base font-bold text-slate-800 mb-4">Escrow Sales Ledgers ({salesOrders.length})</h2>
                {/* Your existing delivery tracking tables pin templates can sit right here */}
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================================
          🚀 STANDALONE CHILD MODULE EMBED:
          Keeps form changes and hook states isolated from your main dashboard data streams!
         ========================================================================= */}
      <AddProductModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(newProduct) => {
          // Prepend newly listed items to your live view immediately
          setAllProducts(prev => [newProduct, ...prev]);
        }}
        uploadImageToCloudinary={uploadImageToCloudinary}
      />
    </div>
  );
}
