import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../features/auth/hooks/useAuth";
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
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isCommitting, setIsCommitting] = useState(false);
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
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
    if (!formData.name.trim()) return alert("Product descriptive title cannot be empty.");
    if (Number(formData.price) <= 0) return alert("Please set a valid retail price.");
    if (
      Number(formData.affiliateCommission) < 0 ||
      Number(formData.affiliateCommission) >= Number(formData.price)
    ) {
      return alert("Invalid Commission: Split reward must be lower than retail price.");
    }
    if (Number(formData.quantity) <= 0) return alert("Stock units must be at least 1.");

    setIsCommitting(true);
    try {
      const uploadedImageUrl = await uploadImageToCloudinary(selectedFile, "products");
      if (!uploadedImageUrl) throw new Error("Cloudinary asset upload failed.");

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
        setAllProducts((prev) => [responseData.product || responseData, ...prev]);
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
      {/* Sidebar Navigation */}
      <aside className={styles["sidebar-panel"]}>
        <div className={styles["brand-row"]}>
          <h1 className={styles["brand-title"]}>myShop <span className={styles["brand-accent"]}>Pro</span></h1>
        </div>
        <nav className={styles["nav-menu"]}>
          <button type="button" onClick={() => setActiveTab("inventory")} className={`${styles["sidebar-link"]} ${activeTab === "inventory" ? styles["sidebar-link-active"] : ""}`}>📦 Inventory Portal</button>
          <button type="button" onClick={() => navigate("/marketplace")} className={styles["sidebar-link"]}>🛒 Browse MarketHub</button>
          <button type="button" onClick={() => navigate("/")} className={styles["sidebar-link"]}>🏠 Home Landing Page</button>
          <button type="button" onClick={() => setIsModalOpen(true)} className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2.5 text-xs font-bold transition">➕ Add New Product</button>
        </nav>
      </aside>

      {/* Main Workspace Frame */}
      <main className="flex-1 p-6 bg-slate-50/50 min-h-screen">
        {activeTab === "inventory" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-800 mb-4">Store Inventory Catalog</h2>
            {/* Table or list of products mapping goes here */}
          </div>
        )}
      </main>

      {/* Modal for Product Listing Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-xl p-6 relative">
            <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">📦 List New Marketplace Product</h2>

            {/* Image Upload Preview Canvas */}
            <div className="flex items-center gap-4 mb-4 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
              <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
                {previewUrl ? <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" /> : <span className="text-xl">17:50</span>}
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">Product Media Graphic</label>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={isCommitting} className="block w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer" />
              </div>
            </div>

            {/* Input Parameter Form Sheets */}
            <div className="space-y-3 mb-6">
              <input type="text" name="name" placeholder="Item descriptive profile title name..." value={formData.name} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none" />
              
              <div className="grid grid-cols-3 gap-2">
                <input type="number" name="price" placeholder="Price (KES)..." value={formData.price} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none" />
                <input type="number" name="affiliateCommission" placeholder="Earn Cut (KES)..." value={formData.affiliateCommission} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-emerald-200 bg-emerald-50/20 px-3 py-3 text-sm text-emerald-800 font-medium focus:border-emerald-500 focus:outline-none" />
                <input type="number" name="quantity" placeholder="Stock count..." value={formData.quantity} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <input type="text" name="category" placeholder="Category (shoes, tech)..." value={formData.category} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none" />
                <input type="text" name="brandName" placeholder="Display Brand Shop Name..." value={formData.brandName} onChange={handleInputChange} disabled={isCommitting} className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" disabled={isCommitting} onClick={() => { setIsModalOpen(false); setPreviewUrl(null); setSelectedFile(null); }} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition">Dismiss</button>
{isCommitting ? "Uploading Asset..." : "Commit Stream"})});}
