import { useState, useRef, useEffect } from "react";
import useAuth from "../auth/hooks/useAuth";

// Slugs must match the backend enum exactly
const SUB_CATEGORY_MAP = {
  "phones-gadgets": [
    { id: "smartphones", label: "📱 Smartphones & Tablets" },
    { id: "charging-power", label: "🔌 Charging & Power Banks" },
    { id: "audio-sound", label: "🎧 Audio & Sound Accessories" },
  ],
  "tech-computing": [
    { id: "laptops-desktops", label: "💻 Laptops & Desktop PCs" },
    { id: "storage-devices", label: "💾 Hard Drives & SSD Storage" },
    { id: "printers-networking", label: "🖨️ Printers & Router Network Gear" },
  ],
  "apparel-fashion": [
    { id: "footwear", label: "👟 Footwear & Shoes" },
    { id: "casual-wear", label: "👕 Casual Apparel" },
    { id: "bags-watches", label: "👜 Luxury Bags & Watches" },
  ],
  "home-appliances": [
    { id: "kitchen-appliances", label: "🍳 Kitchen & Cooking Tools" },
    { id: "living-decor", label: "🏠 Home Decor & Lighting" },
    { id: "smart-security", label: "🔒 Automation & Handset Security" },
  ],
  "beauty-personal-care": [
    { id: "skin-care", label: "🧴 Targeted Skin Care" },
    { id: "hair-wigs", label: "💇 Hair Care, Extensions & Wigs" },
    { id: "makeup-cosmetics", label: "💄 Cosmetics & Makeup Essentials" },
  ],
  "ankara-art": [
    { id: "cultural-wear", label: "👗 Ankara Outfits & Fashion Fabric" },
    { id: "wall-art", label: "🖼️ Handcrafted Decor & Paintings" },
  ],
  general: [{ id: "miscellaneous", label: "📦 General Retail Goods" }],
};

const CATEGORY_LABELS = {
  "phones-gadgets": "📱 Phones & Gadgets",
  "tech-computing": "💻 Tech & Computing",
  "apparel-fashion": "👕 Apparel & Fashion",
  "home-appliances": "🏠 Home Appliances",
  "beauty-personal-care": "💄 Beauty & Care",
  "ankara-art": "🎨 Ankara & Art",
  general: "📦 General Goods",
};

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

// Display-only. The SERVER computes the real fees; these just show the seller what to expect.
const AFFILIATE_PCT = 5;
const PLATFORM_PCT = 1;

const MIN_PRICE = 50;
const MAX_PRICE = 10_000_000;
const MAX_DELIVERY = 100_000;
const MAX_QTY = 100_000;
const MAX_IMAGE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ERROR_TEXT = {
  AUTHENTICATION_REQUIRED: "Please sign in again.",
  MARKETER_ACCOUNT_REQUIRED: "Only active Sokodigi members can list products. Activate your membership first.",
  INVALID_PRODUCT_PRICE: `Price must be a whole number between Ksh ${MIN_PRICE} and Ksh ${MAX_PRICE.toLocaleString()}.`,
  INVALID_PRODUCT_QUANTITY: "Stock must be a whole number.",
  INVALID_DELIVERY_FEE: "Delivery fee must be a whole number.",
  INVALID_CATEGORY: "Please choose a valid category.",
  INVALID_IMAGE_URL: "The image upload could not be verified. Please try another image.",
  NAME_REQUIRED: "Product title cannot be empty.",
  TOO_MANY_REQUESTS: "You're going too fast. Please wait a minute and try again.",
  PLAN_LIMIT_REACHED: "You've reached your plan's product limit. Upgrade to add more."
};

const toWhole = (v) => (/^\d{1,9}$/.test(String(v).trim()) ? Number(v) : NaN);

export default function AddProductModal({ isOpen, onClose, onSuccess, uploadImageToCloudinary }) {
  const { auth } = useAuth();
  const fileInputRef = useRef(null);

  const [isCommitting, setIsCommitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    price: "",
    deliveryFee: "",
    quantity: "",
    category: "phones-gadgets",
    subCategory: "smartphones",
    description: "",
  });

  // Free the preview blob whenever it changes or the modal unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!isOpen) return null;

  const setField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please choose a JPG, PNG or WebP image.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setError(`Image must be smaller than ${MAX_IMAGE_MB} MB.`);
      e.target.value = "";
      return;
    }
    setError("");
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file)); // the effect above revokes the previous one
  };

  const price = toWhole(form.price);
  const priceOk = Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
  const affiliateCut = priceOk ? Math.round((price * AFFILIATE_PCT) / 100) : 0;
  const platformCut = priceOk ? Math.round((price * PLATFORM_PCT) / 100) : 0;

  const handleClose = () => {
    setPreviewUrl(null);
    setSelectedFile(null);
    setError("");
    setForm({
      name: "",
      price: "",
      deliveryFee: "",
      quantity: "",
      category: "phones-gadgets",
      subCategory: "smartphones",
      description: "",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isCommitting) return;
    setError("");

    const name = form.name.trim();
    const quantity = toWhole(form.quantity);
    const deliveryFee = form.deliveryFee === "" ? 0 : toWhole(form.deliveryFee);

    if (!selectedFile) return setError("Please select a product photo.");
    if (!name) return setError("Product title cannot be empty.");
    if (!priceOk) return setError(ERROR_TEXT.INVALID_PRODUCT_PRICE);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      return setError("Stock must be a whole number of at least 1.");
    }
    if (!Number.isInteger(deliveryFee) || deliveryFee < 0 || deliveryFee > MAX_DELIVERY) {
      return setError(`Delivery fee must be a whole number up to Ksh ${MAX_DELIVERY.toLocaleString()}.`);
    }

    const user = auth?.currentUser;
    if (!user) return setError(ERROR_TEXT.AUTHENTICATION_REQUIRED);

    setIsCommitting(true);
    try {
      // Signed upload: the helper gets a one-time permit from our backend first
      const imageUrl = await uploadImageToCloudinary(selectedFile, "products", () => user.getIdToken());
      if (!imageUrl) throw new Error("UPLOAD_FAILED");

      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // Fees, brand name and wholesale price are decided by the server, so none are sent
        body: JSON.stringify({
          name,
          price,
          quantity,
          deliveryFee,
          category: form.category,
          subCategory: form.subCategory,
          description: form.description.trim(),
          imageUrl,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(ERROR_TEXT[data.error] || "Could not list the product. Please try again.");
      }

      onSuccess?.(data.product || data);
      handleClose();
    } catch (err) {
      console.error("Error listing product:", err);
      setError(
        err.message === "UPLOAD_FAILED"
          ? "Image upload failed. Check your connection and try again."
          : err.message || "Something went wrong."
      );
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fadeIn">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-xl p-6 relative"
      >
        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
          📦 List New Marketplace Product
        </h2>

        {/* Image */}
        <div className="flex items-center gap-4 mb-4 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
          <div className="w-16 h-16 rounded-xl bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-xs">
            {previewUrl ? (
              <img src={previewUrl} alt="Product preview" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400 font-bold">No Image</span>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-[10px] font-bold text-emerald-700 uppercase mb-1">
              Product photo (JPG, PNG, WebP · max {MAX_IMAGE_MB} MB)
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              disabled={isCommitting}
              className="block w-full text-xs text-slate-500 file:mr-3 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[10px] file:font-bold file:bg-emerald-700 file:text-white hover:file:bg-emerald-800 cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-3 mb-4">
          <input
            type="text"
            placeholder="Item descriptive title..."
            maxLength={120}
            value={form.name}
            onChange={setField("name")}
            disabled={isCommitting}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
          />

          <div className="grid grid-cols-3 gap-2">
            <input
              type="number"
              inputMode="numeric"
              min={MIN_PRICE}
              max={MAX_PRICE}
              step="1"
              placeholder="Price (KES)"
              value={form.price}
              onChange={setField("price")}
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={MAX_DELIVERY}
              step="1"
              placeholder="Delivery fee"
              value={form.deliveryFee}
              onChange={setField("deliveryFee")}
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_QTY}
              step="1"
              placeholder="Stock"
              value={form.quantity}
              onChange={setField("quantity")}
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-3 py-3 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Live earnings breakdown (replaces the old Margin Cut input) */}
          {priceOk && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 text-[11px] text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <span>Sokodigi fee ({PLATFORM_PCT}%)</span>
                <span>− Ksh {platformCut.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Promoter bonus ({AFFILIATE_PCT}%, only if sold through a promoter)</span>
                <span>− Ksh {affiliateCut.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-emerald-800 pt-1 border-t border-emerald-100">
                <span>You receive</span>
                <span>
                  Ksh {(price - platformCut).toLocaleString()} direct · Ksh{" "}
                  {(price - platformCut - affiliateCut).toLocaleString()} via promoter
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Category</label>
              <select
                value={form.category}
                onChange={(e) => {
                  const next = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    category: next,
                    subCategory: SUB_CATEGORY_MAP[next]?.[0]?.id || "miscellaneous",
                  }));
                }}
                disabled={isCommitting}
                className="w-full rounded-xl border border-slate-200 p-2 text-xs bg-white text-slate-700 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Intended Use/Need</label>
              <select
                value={form.subCategory}
                onChange={setField("subCategory")}
                disabled={isCommitting}
                className="w-full rounded-xl border border-slate-200 p-2 text-xs bg-white text-slate-700 font-bold focus:border-emerald-500 focus:outline-none cursor-pointer"
              >
                {(SUB_CATEGORY_MAP[form.category] || SUB_CATEGORY_MAP.general).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col space-y-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">
              Product Specification Profile
            </label>
            <textarea
              placeholder="Detailed description, key features..."
              maxLength={2000}
              rows={2}
              value={form.description}
              onChange={setField("description")}
              disabled={isCommitting}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-xs focus:border-emerald-500 focus:outline-none resize-none"
            />
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs font-medium text-red-700"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            disabled={isCommitting}
            onClick={handleClose}
            className="px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold hover:bg-slate-200 transition duration-150 cursor-pointer"
          >
            Dismiss
          </button>
          <button
            type="submit"
            disabled={isCommitting}
            className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition duration-150 disabled:opacity-40 cursor-pointer"
          >
            {isCommitting ? "Uploading..." : "List product"}
          </button>
        </div>
      </form>
    </div>
  );
}
