import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productPath } from "../../../constants/routes";
import ShareButton from "../ProductDetails/ShareButton";

const formatKsh = (v) => `KSh ${Number(v || 0).toLocaleString("en-KE")}`;

// Cloudinary can resize on the fly: smaller images load much faster on phones
function sized(url, w = 600) {
  if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !url.includes("/image/upload/")) return url || "";
  if (/\/image\/upload\/[^/]*(w_|f_|q_)/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${w}/`);
}

function Placeholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-emerald-800" aria-label="No product image">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h18l-2 12H5L3 8Zm5 0 4-5 4 5M9 12v4m6-4v4" />
        </svg>
      </span>
      <span className="text-[11px] font-semibold text-slate-400">No image</span>
    </div>
  );
}

export default function ProductCard({ product }) {
  const [imageFailed, setImageFailed] = useState(false);

  const id = product?._id || product?.id;
  const image = sized(product?.imageUrl);
  const price = Number(product?.price || 0);
  const originalPrice = Number(product?.originalPrice || 0);
  const bonus = Number(product?.affiliateCommission || 0); // the server only sends this to active marketers
  const stock = Number(product?.quantity || 0);
  const delivery = Number(product?.deliveryFee || 0);

  const hasOffer = originalPrice > price && originalPrice > 0;
  const off = hasOffer ? Math.round(((originalPrice - price) / originalPrice) * 100) : 0;
  const inStock = stock > 0;
  const rating = Number(product?.rating);

  useEffect(() => setImageFailed(false), [image]);
  if (!id) return null;

  const to = productPath(id);

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:border-emerald-900/15 hover:shadow-lg">
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-[#f6faf6] to-[#edf5ee]">
        {image && !imageFailed ? (
          <img src={image} alt={product?.name || "Product"} loading="lazy" onError={() => setImageFailed(true)}
            className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <Placeholder />
        )}

        <div className="absolute left-2.5 top-2.5 flex flex-col items-start gap-1.5">
          {hasOffer && <span className="rounded-full bg-rose-600 px-2.5 py-1 text-[10px] font-extrabold text-white shadow-sm">{off}% OFF</span>}
          {!inStock && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold text-white">Sold out</span>}
          {inStock && stock <= 5 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">Only {stock} left</span>}
        </div>

        {bonus > 0 && (
          <span className="absolute bottom-2.5 right-2.5 rounded-full border border-emerald-100 bg-white/95 px-3 py-1.5 text-[10px] font-extrabold text-emerald-800 shadow-md">
            Earn {formatKsh(bonus)} per sale
          </span>
        )}
      </div>

      {/* Details */}
      <div className="flex flex-1 flex-col gap-2 p-3.5 sm:p-4">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-700">{product?.brandName || "Sokodigi seller"}</p>

        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-extrabold leading-5 text-slate-800 transition-colors group-hover:text-emerald-800">
          {/* The stretched link makes the WHOLE card tappable */}
          <Link to={to} className="after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-600 focus-visible:after:ring-inset focus-visible:after:rounded-2xl">
            {product?.name || "Untitled product"}
          </Link>
        </h3>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-bold capitalize text-emerald-800">{String(product?.category || "general").replace(/-/g, " ")}</span>
          {Number.isFinite(rating) && rating > 0 && <span className="font-bold text-slate-600"><span className="text-amber-500" aria-hidden="true">★</span> {rating.toFixed(1)}</span>}
        </div>

        <div className="mt-auto pt-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xl font-black tracking-tight text-emerald-900">{formatKsh(price)}</span>
            {hasOffer && <span className="text-xs font-semibold text-slate-400 line-through">{formatKsh(originalPrice)}</span>}
          </div>
          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
            {delivery > 0 ? `+ ${formatKsh(delivery)} delivery` : <span className="text-emerald-700">Free delivery</span>}
            {inStock && stock > 5 && <span className="text-slate-400"> · {stock.toLocaleString("en-KE")} in stock</span>}
          </p>
           <ShareButton type="product" targetIdentifier={product._id} />
        </div>
        
  
        
        {/* Visual button: the stretched link above handles the tap */}
        <span aria-hidden="true"
          className={`mt-1 inline-flex min-h-11 items-center justify-center rounded-xl px-3 text-xs font-extrabold ${inStock ? "bg-emerald-700 text-white group-hover:bg-emerald-800" : "bg-slate-200 text-slate-500"}`}>
          {inStock ? "Buy now" : "Sold out"}
        </span>
      </div>
    </article>
  );
}
