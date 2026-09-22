import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader"; 
import styles from "./MyShopDashboard.module.css"; 

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function MyShopDashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const currentUserId = auth?.currentUser?.uid;

  const [activeTab, setActiveTab] = useState("inventory");
  const [allProducts, setAllProducts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]); 
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pinInputs, setPinInputs] = useState({}); 
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    affiliateCommission: "",
    quantity: "",
    category: "general",
    description: "",
    brandName: auth?.profile?.brandName || ""
  });

  const fileInputRef = useRef(null);

  // Synchronize data: fetch inventory and orders
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

        // 1. Fetch Inventory
        const prodRes = await fetch(`${API_URL}/api/products?sellerId=${resolvedSellerId}&status=all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          setAllProducts(Array.isArray(prodData) ? prodData : []);
        }

        // 2. Fetch Orders
        const orderRes = await fetch(`${API_URL}/api/orders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (orderRes.ok) {
          const orderData = await orderRes.json();
          setSalesOrders(Array.isArray(orderData) ? orderData : []);
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

  const handleFileChange = (e) => {
    const file = e.target.files[0]; // Correctly access first file
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file.");
        return;
      }
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setPreviewUrl(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCommitProductStream = async (e) => {
    e.preventDefault();
    if (!selectedFile) return alert("Please select a product thumbnail graphic to display.");
    if (!formData.name.trim()) return alert("Product title cannot be empty.");
    if (Number(formData.price) <= 0) return alert("Please set a valid retail price.");
    if (Number(formData.affiliateCommission) < 0 || Number(formData.affiliateCommission) >= Number(formData.price)) {
      return alert("Invalid Commission split value parameters.");
    }
    if (Number(formData.quantity) <= 0) return alert("Stock levels must register at least 1 unit.");

    setIsCommitting(true);
    try {
      const uploadedImageUrl = await uploadImageToCloudinary(selectedFile, "products");
      if (!uploadedImageUrl) throw new Error("Cloudinary asset upload failure.");

      const productPayload = {
        name: formData.name.trim(),
        price: Number(formData.price),
        affiliateCommission: Number(formData.affiliateCommission),
        wholesalePrice: Number(formData.price) - Number(formData.affiliateCommission),
        quantity: Number(formData.quantity),
        category: formData.category.toLowerCase(),
        description: formData.description.trim(),
        brandName: formData.brandName || auth?.profile?.brandName || "SokoDigi Merchant",
        imageUrl: uploadedImageUrl,
      };

      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch(`${API_URL}/api/products`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(productPayload),
      });
      const responseData = await response.json();

      if (response.ok) {
        alert("🎉 Inventory Asset listed successfully!");
        setAllProducts(prev => [responseData.product || responseData, ...prev]);
        setIsModalOpen(false);
        setPreviewUrl(null);
        setSelectedFile(null);
        setFormData({ name: "", price: "", affiliateCommission: "", quantity: "", category: "general", description: "", brandName: auth?.profile?.brandName || "" });
      } else {
        throw new Error(responseData.reason || responseData.error || "Failed to list product");
      }
    } catch (err) {
      console.error("Error listing product:", err);
      alert(`Asset transaction rejected: ${err.message}`);
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className={styles["dashboard-layout"]}>
      {/* Sidebar */}
      <aside className={styles["sidebar-panel"]}>
        <div className={styles["brand-row"]}>
          <h1 className={styles["brand-title"]}>myShop <span className={styles["brand-accent"]}>Pro</span></h1>
        </div>
        <nav className={styles["nav-menu"]}>
          <button type="button" onClick={() => setActiveTab("inventory")} className={`${styles["sidebar-link"]} ${activeTab === "inventory" ? styles["sidebar-link-active"] : ""}`}>📦 Inventory Portal</button>
          <button type="button" onClick={() => navigate("/wallet")} className={styles["sidebar-link"]}>💳 Shop Revenue Wallet</button>
          <button type="button" onClick={() => setActiveTab("sales_orders")} className={`${styles["sidebar-link"]} ${activeTab === "sales_orders" ? styles["sidebar-link-active"] : ""}`}>📋 Customer Incoming Orders</button>
          <button type="button" onClick={() => navigate("/marketplace")} className={styles["sidebar-link"]}>🛒 Browse MarketHub</button>
          <button type="button" onClick={() => navigate("/")} className={styles["sidebar-link"]}>🏠 Home Landing Page</button>
          <button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-xs font-bold transition">➕ Add New Product</button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 bg-slate-50/50 min-h-screen">
        {isLoading ? (
          <div className="text-center py-20 text-xs font-bold text-slate-400 animate-pulse uppercase tracking-wider">Synchronizing ledger arrays...</div>
        ) : (
          <>
            {/* Inventory Management Table */}
            {activeTab === "inventory" && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6">
                  <h2 className="text-base font-bold text-slate-800">Warehouse Stock Registry</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Manage production levels and transfer asset documents directly to live public shelves.</p>
                </div>
                {allProducts.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          <th className="py-3 px-4">Item Details</th>
                          <th className="py-3 px-4">Wholesale/Retail Price</th>
                          <th className="py-3 px-4">Stock Level</th>
                          <th className="py-3 px-4">Shelf Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 text-sm text-slate-700">
                        {allProducts.map((item) => (
                          <tr key={item._id} className="hover:bg-slate-50/50 transition">
                            <td className="py-4 px-4 flex items-center gap-3">
                              <img src={item.imageUrl} alt={item.name} className="h-10 w-10 rounded-lg object-cover border border-slate-100" crossOrigin="anonymous" />
                              <div>
                                <span className="font-bold text-slate-800 block">{item.name}</span>
                                <span className="font-mono text-[10px] text-slate-400 uppercase">{item.productCode}</span>
                              </div>
                            </td>
                            <td className="py-4 px-4 font-medium">
                              <span className="block text-slate-400 text-xs">Wholesale: KES {item.wholesalePrice}</span>
                              <span className="block text-slate-800 font-bold">Retail: KES {item.price}</span>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${item.quantity > 5 ? "bg-slate-50 text-slate-700" : "bg-red-50 text-red-700"}`}>
                                {item.quantity} units
                              </span>
                            </td>
                            <td className="py-4 px-4">
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${
                                item.status === "LISTED" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500"
                              }`}>
                                {item.status === "LISTED" ? "🛒 On Shelves" : "📦 In Vault"}
                              </span>
                            </td>
                            <td className="py-4 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => handleToggleShelfPlacement(item._id)}
                                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                                  item.status === "LISTED"
                                    ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
                                    : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                                }`}
                              >
                                {item.status === "LISTED" ? "Take Down" : "Put on Shelves"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400 text-xs">
                    Your warehouse vault storage is currently empty. Click "Add New Product" to stock items!
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {/* Modal for Adding New Product */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 relative">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">📦 List New Marketplace Product</h2>
            {/* Upload Image Preview */}
            <div className="flex items-center gap-4 mb-4 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
              <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl">17:50</span>
                )}
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">
                  Product Media Graphic
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isCommitting}
                  className="block w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
                />
              </div>
            </div>

            {/* Form Inputs */}
            <div className="space-y-3 mb-6">
              <input
                type="text"
                name="name"
                placeholder="Item descriptive profile title name..."
                value={formData.name}
                onChange={handleInputChange}
                disabled={isCommitting}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  name="price"
                  placeholder="Price (KES)..."
                  value={formData.price}
                  onChange={handleInputChange}
                  disabled={isCommitting}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  name="affiliateCommission"
                  placeholder="Earn Cut (KES)..."
                  value={formData.affiliateCommission}
                  onChange={handleInputChange}
                  disabled={isCommitting}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50/20 px-3 py-3 text-sm text-emerald-800 font-medium focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="number"
                  name="quantity"
                  placeholder="Stock count..."
                  value={formData.quantity}
                  onChange={handleInputChange}
                  disabled={isCommitting}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  name="category"
                  placeholder="Category (shoes, tech)..."
                  value={formData.category}
                  onChange={handleInputChange}
                  disabled={isCommitting}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="text"
                  name="brandName"
                  placeholder="Display Brand Shop Name..."
                  value={formData.brandName}
                  onChange={handleInputChange}
                  disabled={isCommitting}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={isCommitting}
                onClick={() => {
                  setIsModalOpen(false);
                  setPreviewUrl(null);
                  setSelectedFile(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleCommitProductStream}
                disabled={isCommitting}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-40"
              >
                {isCommitting ? "Uploading Asset..." : "Commit Stream"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
