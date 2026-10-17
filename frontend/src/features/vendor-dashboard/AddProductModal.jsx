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
    setPreviewUrl(URL.createObjectURL(file)); // the effect above revokes the previous
