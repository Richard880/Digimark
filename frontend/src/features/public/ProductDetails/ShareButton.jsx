import React, { useState } from "react";
import { productPath, profilePath } from "../../../constants/routes";

export default function ShareButton({ type, targetIdentifier }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e) => {
    e.preventDefault(); // Prevents link navigation if nested inside a card
    
    // 🟢 Step 1: Detect the current host domain automatically (works on local, preview, and vercel production)
    const baseDomain = window.location.origin; 
    
    // 🟢 Step 2: Resolve the absolute URL string path using your ROUTES constants
    const dynamicPath = type === "product" 
      ? productPath(targetIdentifier) 
      : profilePath(targetIdentifier);
      
    const absoluteShareUrl = `${baseDomain}${dynamicPath}`;

    // 🟢 Step 3: Copy to the device's clipboard
    try {
      await navigator.clipboard.writeText(absoluteShareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Reset button label state after 2 seconds
    } catch (err) {
      console.error("Could not copy clipboard text:", err);
    }
  };

  return (
    <button
      type="button"
      onClick={handleShare}
      className={`rounded-xl px-3 py-1.5 text-xs font-bold transition duration-200 cursor-pointer ${
        copied 
          ? "bg-emerald-600 text-white animate-scale" 
          : "bg-slate-100 text-slate-700 hover:bg-slate-200"
      }`}
    >
      {copied ? "✓ Link Copied!" : "🔗 Share"}
    </button>
  );
}
