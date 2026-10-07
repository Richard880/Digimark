import { useState, useEffect } from "react";
import apiClient from "../../../services/apiClient";

/**
 * 🎨 STANDALONE HERO CAROUSEL MODULE
 * Safely manages its own independent lifecycle hooks to prevent React Error #310.
 */
export default function HeroSlider({ products = [], onProductClick }) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Take up to 5 items to showcase in the trending carousel
  const sliderItems = products.slice(0, 5);

  // Auto-slide transition engine loop handles movement cleanly
  useEffect(() => {
    if (sliderItems.length <= 1) return;
    
    const slideTimer = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % sliderItems.length);
    }, 6000);

    return () => clearInterval(slideTimer);
  }, [sliderItems.length]);

  // Reset index seamlessly if items change unexpectedly
  useEffect(() => {
    setCurrentIndex(0);
  }, [products]);

  // Static fallback shell if data is loading or empty
  if (!sliderItems.length) {
    return (
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-emerald-800 via-emerald-900 to-slate-900 text-white p-8 md:p-12 shadow-xl min-h-[380px] flex items-center">
        <div className="relative z-10 max-w-2xl space-y-4">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            SokoDigi Marketplace
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight leading-tight">
            Discover products from the digital market community.
          </h1>
          <p className="text-sm md:text-base text-emerald-100/80 leading-relaxed">
            Browse listed products from SokoDigi sellers and discover businesses, brands, and opportunities in one unified marketplace.
          </p>
        </div>
      </div>
    );
  }

  const activeProduct = sliderItems[currentIndex];
  const productId = activeProduct._id || activeProduct.id;
  const imageUrl = activeProduct.imageUrl?.startsWith("http")
    ? activeProduct.imageUrl
    : `${apiClient.defaults.baseURL.replace(/\/api\/?$/, "")}${activeProduct.imageUrl || ""}`;
  
  const commission = Number(activeProduct.affiliateCommission || 0);

  return (
    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white shadow-xl min-h-[420px] md:min-h-[480px] flex items-center group">
      
      {/* Abstract Background Matrix Grids Layer */}
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />
      
      <div className="w-full p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8 items-center relative z-10">
        
        {/* LEFT COMPREHENSIVE SPEC DETAIL TEXT FRAME */}
        <div className="md:col-span-7 space-y-5 transition-all duration-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 tracking-wider">
              📢 Trending Hub Listing
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-800 text-slate-300 border border-slate-700 tracking-wider">
              {activeProduct.brandName || "SokoDigi Merchant"}
            </span>
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-none text-white drop-shadow-sm line-clamp-2">
              {activeProduct.name}
            </h1>
            <p className="text-sm md:text-base text-emerald-100/70 leading-relaxed font-medium line-clamp-2 max-w-xl">
              {activeProduct.description || "Discover verified premium products listed by the SokoDigi digital commerce community."}
            </p>
          </div>

          {/* BALANCE INCOME VALUE CHIPS */}
          <div className="flex flex-wrap items-center gap-4 bg-slate-900/40 backdrop-blur-xs rounded-2xl border border-white/5 p-4 w-max">
            <div>
              <span className="block text-[9px] uppercase font-bold text-slate-400 tracking-wider">Retail Value</span>
              <span className="text-xl font-black text-white">KSh {Number(activeProduct.price || 0).toLocaleString()}</span>
            </div>
            {commission > 0 && (
              <>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <span className="block text-[9px] uppercase font-bold text-amber-400 tracking-wider">Affiliate Profit Cut</span>
                  <span className="text-xl font-black text-amber-400">KSh {commission.toLocaleString()}</span>
                </div>
              </>
            )}
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={() => onProductClick?.(productId)}
              className="rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs px-6 py-3.5 uppercase tracking-wider transition shadow-lg shadow-emerald-500/10 flex items-center gap-2"
            >
              Inspect Spec Sheets
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        {/* RIGHT MEDIA GRAPHIC FRAME PLACEMENT */}
        <div className="md:col-span-5 flex items-center justify-center relative min-h-[220px] md:min-h-none">
          <div className="absolute h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl pointer-events-none" />
          
          <div className="relative max-h-56 md:max-h-72 w-full flex items-center justify-center p-4 bg-white/5 border border-white/10 backdrop-blur-xs rounded-3xl shadow-2xl overflow-hidden group-hover:border-emerald-500/30 transition-colors duration-300">
            <img 
              src={imageUrl} 
              alt={activeProduct.name} 
              className="max-h-48 md:max-h-64 max-w-full object-contain drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)]" 
              crossOrigin="anonymous"
            />
          </div>
        </div>

        {/* STEP DOT CAROUSEL PROGRESS INDICATORS */}
        {sliderItems.length > 1 && (
          <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 z-20">
            {sliderItems.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                onClick={() => setCurrentIndex(dotIdx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  currentIndex === dotIdx ? "w-6 bg-emerald-400" : "w-1.5 bg-white/30 hover:bg-white/50"
                }`}
                aria-label={`Slide target navigation node ${dotIdx + 1}`}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
