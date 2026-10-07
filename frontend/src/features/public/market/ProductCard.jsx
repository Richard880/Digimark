import apiClient from "../../../services/apiClient";

/**
 * 📦 Reusable Commercial Product Card Component
 * Formats image assets dynamically and remains compatible with route navigation trees
 */
export default function ProductCard({ product, onClick }) {
  const productId = product._id || product.id;
  
  // Cleanly format the destination image routing path string properties
  const imageUrl = product.imageUrl?.startsWith("http")
    ? product.imageUrl
    : `${apiClient.defaults.baseURL.replace(/\/api\/?$/, "")}${product.imageUrl || ""}`;

  return (
    <button
      type="button"
      onClick={() => onClick?.(productId)}
      className="group bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-600/40 transition-all text-left flex flex-col h-full w-full focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
    >
      {/* Aspect Video Media Frame Container */}
      <div className="relative aspect-video w-full bg-slate-50 overflow-hidden border-b border-slate-100">
        <img 
          src={imageUrl} 
          alt={product.name} 
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" 
          crossOrigin="anonymous"
          loading="lazy"
        />
      </div>
      
      {/* Information Spec Metadata Block */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <p className="text-sm font-medium text-slate-600">
          {product.brandName || "SokoDigi Seller"}
        </p>
        <h3 className="text-lg font-bold text-slate-800 line-clamp-1 group-hover:text-emerald-700 transition-colors">
          {product.name}
        </h3>
        
        {/* Core Wallet Price Variables Display */}
        <div className="mt-auto pt-2 space-y-1">
          <p className="text-2xl font-extrabold text-emerald-600 tracking-tight">
            KSh {Number(product.price || 0).toLocaleString()}
          </p>
          <p className="text-xs font-semibold text-slate-400">
            🚚 Delivery: KSh {Number(product.deliveryFee || 0).toLocaleString()}
          </p>
        </div>
      </div>
    </button>
  );
}
