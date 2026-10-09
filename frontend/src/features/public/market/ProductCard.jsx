import apiClient from "../../../services/apiClient";

export default function ProductCard({ product, onClick }) {
  const productId = product._id || product.id;
  
  // Format target display image path
  const imageUrl = product.imageUrl?.startsWith("http")
    ? product.imageUrl
    : `${apiClient.defaults.baseURL.replace(/\/api\/?$/, "")}${product.imageUrl || ""}`;

  // Fallback math parameters mirroring our dynamic multi-level accounting matrix
  const retailPrice = Number(product.price || 0);
  const originalPrice = Number(product.originalPrice || 0); // 🎯 Added for promotion tracking
  const commission = Number(product.affiliateCommission || 0);
  const stockCount = Number(product.quantity || 0);

  // Calculate dynamic savings percentage drop if product is on sale
  const hasOffer = originalPrice > retailPrice;
  const discountPercent = hasOffer ? Math.round(((originalPrice - retailPrice) / originalPrice) * 100) : 0;

  return (
    <div className="group bg-white border border-slate-200/80 rounded-3xl overflow-hidden shadow-xs hover:shadow-lg transition-all duration-300 flex flex-col h-full w-full relative">
      
      {/* 🟢 TOP ACTION BADGES */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none gap-2">
        {/* Marketplace Identity Label Tag */}
        <span className="bg-slate-900/80 backdrop-blur-xs text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-white/10 shrink-0">
          SokoDigi
        </span>
        
        <div className="flex items-center gap-1.5">
          {/* 🎯 FIXED: Dynamic Offer / Promo Capsule Ribbon */}
          {hasOffer && (
            <span className="bg-rose-600 text-white text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-rose-500 shadow-xs animate-pulse">
              🔥 {discountPercent}% OFF
            </span>
          )}

          {/* Real-time Inventory Shell Readout Tag */}
          <span className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${
            stockCount > 0 
              ? "bg-emerald-50 text-emerald-700 border-emerald-200/60" 
              : "bg-red-50 text-red-700 border-red-200/60"
          }`}>
            ● {stockCount > 0 ? "In Stock" : "Out of Stock"}
          </span>
        </div>
      </div>

      {/* 🖼️ HERO IMAGE CONTAINER GRAPHIC */}
      <div className="relative aspect-[4/3] w-full bg-slate-50 overflow-hidden border-b border-slate-100 flex items-center justify-center p-4">
        <img 
          src={imageUrl} 
          alt={product.name} 
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-500" 
          crossOrigin="anonymous"
          loading="lazy"
        />

        {/* 🔥 HIGH-CONTRAST FLOATING COMMISSION FLOATER */}
        {commission > 0 && (
          <div className="absolute bottom-3 right-3 bg-amber-400 border-2 border-white text-slate-950 font-black rounded-full h-14 w-14 shadow-md flex flex-col items-center justify-center text-center p-1 leading-none transform translate-y-1 group-hover:translate-y-0 transition-transform duration-300">
            <span className="text-[7px] uppercase tracking-tighter opacity-80 font-bold">Earn</span>
            <span className="text-[11px] font-black mt-0.5">KSh {commission.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* 📄 PRODUCT SUMMARY TEXT ENTITIES */}
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 block mb-0.5">
            {product.brandName || "SokoDigi Seller"}
          </span>
          <h3 className="text-base font-black text-slate-800 line-clamp-1 group-hover:text-emerald-600 transition-colors">
            {product.name}
          </h3>
          <p className="text-xs text-slate-400 line-clamp-1 mt-0.5 font-medium">
            {product.description || "Premium verified community listing asset."}
          </p>
        </div>

        {/* ⭐⭐⭐⭐⭐ RATING REPLICAS METRICS CONTAINER */}
        <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5 w-max border border-slate-100">
          <div className="flex text-amber-400 text-xs tracking-tighter">★★★★★</div>
          <span className="text-[10px] font-bold text-slate-500">(4.8)</span>
          <span className="text-slate-300 text-xs">|</span>
          <span className="text-[10px] font-bold text-slate-500 capitalize">{product.category || "General"}</span>
        </div>

        {/* 🎯 FIXED: Clean consumer pricing panel (Removed explicit rows grid matrix block) */}
        <div className="flex items-baseline gap-2 bg-slate-50/50 rounded-2xl border border-slate-100 px-4 py-3 mt-1.5">
          <div className="flex flex-col">
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tight block">Selling Price</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-base font-black text-slate-900 tracking-tight">
                KSh {retailPrice.toLocaleString()}
              </span>
              {hasOffer && (
                <span className="text-xs font-bold text-slate-400 line-through tracking-tight">
                  KSh {originalPrice.toLocaleString()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 📦 LOWER METADATA REGISTRY ENTRIES FOOTER ROW */}
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-1 text-[10px] font-bold text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>Available:</span>
            <span className="text-slate-700 font-extrabold">{stockCount} units</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span>Delivery:</span>
            <span className="text-slate-700 font-extrabold">KSh {Number(product.deliveryFee || 0).toLocaleString()}</span>
          </div>
        </div>

        {/* 🎯 CORE INTERACTION ACTION CONTROL BUTTON KEYS */}
        <div className="grid grid-cols-4 gap-2 mt-2 pt-1">
          <button
            type="button"
            onClick={() => onClick?.(productId)}
            className="col-span-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs py-3 text-center transition shadow-xs flex items-center justify-center gap-2 group/btn cursor-pointer"
          >
            🛒 Add to Basket
          </button>
          
          <button
            type="button"
            onClick={() => onClick?.(productId)}
            className="col-span-1 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-700 transition cursor-pointer"
            title="View Product Layout Specifications Details Passing Keys"
          >
            <svg className="h-4 w-4 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
}
