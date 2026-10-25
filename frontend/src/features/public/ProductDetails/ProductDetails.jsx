import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES from "../../../constants/routes";
import { sizedImage } from "../../../utils/image";
import ShareButton from "./ShareButton";

const REF_RE = /^[A-Za-z0-9_-]{8,32}$/;
const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;

const TRUST = [
  ["🔒", "Escrow protected", "Your money is held until you confirm delivery."],
  ["📲", "Pay with M-Pesa", "Top up your wallet, then pay in one tap."],
  ["🔑", "PIN on delivery", "The seller is paid only after you give your PIN."],
];

export default function ProductDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { auth } = useAuth();
  const { onAuthClick } = useOutletContext() || {};
  const navigate = useNavigate();

  const signedIn = auth.authenticated;
  const isMarketer = auth.destination === "dashboard"; // active, paid marketer

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [tab, setTab] = useState("details");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Remember the promoter's code for THIS product until checkout (shared links end in ?ref=<code>)
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (id && ref && REF_RE.test(ref)) sessionStorage.setItem(`sokodigi_ref_${id}`, ref);
  }, [id, searchParams]);

  const fetchProduct = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get(`/products/${id}`);
      setProduct(data.product || null);
    } catch (err) {
      console.error("Failed to load product:", err);
      setProduct(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) fetchProduct();
    setImageFailed(false);
    setTab("details");
  }, [id, fetchProduct]);

  const stock = product?.quantity || 0;
  useEffect(() => setQuantity((q) => Math.min(Math.max(1, q), Math.max(1, stock))), [stock]);

  const isOwner = !!(auth.user?._id && product && String(auth.user._id) === String(product.sellerId));

  const needSignIn = (message) => {
    setNotice(message);
    onAuthClick?.();
  };

  const handleBuy = () => {
    if (!signedIn) return needSignIn("Create a free account or sign in to place your order.");
    if (stock < 1) return setNotice("This item is sold out.");
    // Only a well-formed code is passed on. The server verifies it belongs to a real promoter.
    const stored = sessionStorage.getItem(`sokodigi_ref_${product._id}`);
    const shareCode = stored && REF_RE.test(stored) ? stored : undefined;
    navigate(ROUTES.CHECKOUT, { state: { productId: product._id, quantity, shareCode } });
  };

  const handleChat = () => {
    if (!signedIn) return needSignIn("Sign in to message the seller.");
    navigate(`${ROUTES.MESSAGES}?targetUser=${product.sellerId}&initMsg=true`);
  };

  const handleShelfToggle = async () => {
    setBusy(true); setNotice("");
    try {
      await apiClient.patch(`/products/${id}/toggle-shelf`);
      setNotice("Storefront updated.");
      await fetchProduct();
    } catch (err) {
      console.error("Toggle shelf failed:", err);
      setNotice("Couldn't update your storefront. Please try again.");
    } finally { setBusy(false); }
  };

  const handleCopyShareLink = async () => {
    setBusy(true); setNotice("");
    try {
      const { data } = await apiClient.post(`/products/${id}/share`);
      await navigator.clipboard.writeText(data.shareUrl);
      setNotice("Your share link was copied. You earn the promoter bonus on sales through it.");
    } catch (err) {
      console.error("Share link failed:", err);
      setNotice("Couldn't create your share link. Please try again.");
    } finally { setBusy(false); }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-3xl bg-slate-100" />
          <div className="space-y-4">
            <div className="h-8 w-3/4 animate-pulse rounded bg-slate-100" />
            <div className="h-10 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="text-sm font-bold text-slate-700">This product isn't available.</p>
        <Link to={ROUTES.MARKETPLACE} className="mt-3 inline-block text-xs font-bold text-emerald-700 underline">Back to the MarketHub</Link>
      </div>
    );
  }

  const delivery = product.deliveryFee || 0;
  const total = product.price * quantity + delivery;
  const soldOut = stock < 1;
  const image = sizedImage(product.imageUrl, 900);
  const category = String(product.category || "general").replace(/-/g, " ");
  const tabBtn = (key, label) => (
    <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key}
      className={`shrink-0 border-b-2 px-4 py-3 text-xs font-black uppercase tracking-wider transition ${tab === key ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-400 hover:text-slate-700"}`}>
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-44 pt-4 sm:px-6 lg:pb-10">
      <nav aria-label="Breadcrumb" className="mb-3 text-xs text-slate-500">
        <Link to={ROUTES.MARKETPLACE} className="font-semibold text-emerald-700 hover:underline">MarketHub</Link>
        <span aria-hidden="true"> / </span>
        <span className="capitalize">{category}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        {/* Image */}
        <div className="flex aspect-square max-h-[32rem] items-center justify-center overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-[#f6faf6] to-[#edf5ee] p-4">
          {image && !imageFailed ? (
            <img src={image} alt={product.name} onError={() => setImageFailed(true)} className="h-full w-full object-contain" />
          ) : (
            <span className="text-sm font-bold text-slate-300">No image</span>
          )}
        </div>

        {/* Details */}
        <div className="flex flex-col">
          {product.brandName && <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">{product.brandName}</p>}
          <h1 className="mt-1 text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">{product.name}</h1>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-black tracking-tight text-emerald-800">{fmt(product.price)}</span>
            <span className="text-sm font-semibold text-slate-500">{delivery > 0 ? `+ ${fmt(delivery)} delivery` : <span className="text-emerald-700">Free delivery</span>}</span>
          </div>

          <p className="mt-2 text-xs font-bold">
            {soldOut ? <span className="text-red-600">Sold out</span>
              : stock <= 5 ? <span className="text-amber-700">Only {stock} left</span>
              : <span className="text-emerald-700">In stock ({stock.toLocaleString("en-KE")} available)</span>}
          </p>

          <ul className="mt-5 space-y-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
            {TRUST.map(([icon, title, text]) => (
              <li key={title} className="flex items-start gap-3">
                <span className="text-lg" aria-hidden="true">{icon}</span>
                <p className="text-xs leading-snug text-slate-600"><b className="block text-slate-900">{title}</b>{text}</p>
              </li>
            ))}
          </ul>

          {/* Marketer tools. The server only sends commission data to active marketers. */}
          {isMarketer && product.affiliateCommission != null && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Promoter bonus</p>
                <p className="text-sm font-black text-emerald-700">+{fmt(product.affiliateCommission)} per sale</p>
              </div>
              {isOwner ? (
                <button type="button" onClick={handleShelfToggle} disabled={busy}
                  className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  📌 {product.isShelved ? "Remove from my storefront" : "Show on my storefront"}
                </button>
              ) : (
                <button type="button" onClick={handleCopyShareLink} disabled={busy}
                  className="min-h-11 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
                  🔗 Copy my share link
                </button>
              )}
            </div>
          )}

          {/* Quantity */}
          {!isOwner && (
            <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">Quantity</span>
              <div className="flex items-center overflow-hidden rounded-xl border border-slate-200">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={soldOut || quantity <= 1}
                  className="h-11 w-11 bg-slate-50 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40">−</button>
                <span className="w-12 text-center text-sm font-black tabular-nums" aria-live="polite">{soldOut ? 0 : quantity}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQuantity((q) => Math.min(stock, q + 1))} disabled={soldOut || quantity >= stock}
                  className="h-11 w-11 bg-slate-50 text-lg font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40">+</button>
              </div>
            </div>
          )}

          {notice && <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-700">{notice}</p>}

         {isOwner ? (
  <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
    <p>This is your own product, so you cannot purchase it. Feel free to share it with your networks.</p>
    <div className="mt-2">
      <ShareButton type="product" targetIdentifier={product._id} />
    </div>
  </div>
) : (
            <div className="mt-5 space-y-3">
        <ShareButton type="product" targetIdentifier={product._id} />
              <button type="button" onClick={handleBuy} disabled={soldOut}
                className="hidden min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm transition hover:bg-emerald-800 disabled:bg-slate-300 lg:flex">
                {soldOut ? "Sold out" : `Buy now · ${fmt(total)}`}
              </button>
              <button type="button" onClick={handleChat}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-emerald-800/20 bg-white text-sm font-bold text-emerald-900 transition hover:bg-emerald-50">
                💬 Message the seller
              </button>
              
              
            </div>
      
          )}
          
        </div>
      </div>

      {/* Tabs */}
      <section className="mt-10">
        <div className="flex overflow-x-auto border-b border-slate-200" role="group" aria-label="Product information">
          {tabBtn("details", "Details")}
          {tabBtn("delivery", "Delivery & escrow")}
          {isOwner && tabBtn("earnings", "Your earnings")}
        </div>
        <div className="max-w-3xl pt-5 text-sm leading-relaxed text-slate-700">
          {tab === "details" && <p className="whitespace-pre-line">{product.description || "The seller hasn't added a description yet. Message them to ask about this product."}</p>}
          {tab === "delivery" && (
            <ol className="space-y-3">
              <li><b>1. You pay into escrow.</b> Your payment is held by Sokodigi, not sent to the seller straight away.</li>
              <li><b>2. The seller delivers.</b> Delivery is arranged between you and the seller. Message them to agree on time and place.</li>
              <li><b>3. You confirm with your PIN.</b> When your item arrives, give the seller your 6-digit PIN. That releases the payment.</li>
              <li><b>Changed your mind?</b> You can cancel while your order is still being processed and get a full refund to your wallet.</li>
            </ol>
          )}
          {tab === "earnings" && isOwner && (
            <div className="space-y-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs">
              <p className="font-black text-slate-800">What you receive per sale</p>
              <p>Sold directly: <b>{fmt(product.price - Math.round(product.price * 0.01))}</b></p>
              <p>Sold through a promoter: <b>{fmt(product.wholesalePrice ?? 0)}</b></p>
              <p className="text-slate-500">After Sokodigi's 1% fee, and the 5% promoter bonus when applicable. Delivery fees are paid to you in full.</p>
            </div>
          )}
        </div>
      </section>

      {/* Sticky buy bar: phones and tablets. It sits above the bottom tab bar when you're signed in. */}
      {!isOwner && (
        <div className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden"
          style={{ bottom: signedIn ? "calc(3.75rem + env(safe-area-inset-bottom))" : 0, paddingBottom: signedIn ? undefined : "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-6xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
              <p className="truncate text-lg font-black text-emerald-800">{fmt(total)}</p>
            </div>
            <button type="button" onClick={handleBuy} disabled={soldOut}
              className="ml-auto min-h-12 flex-1 rounded-xl bg-emerald-700 px-6 text-sm font-black text-white hover:bg-emerald-800 disabled:bg-slate-300 sm:flex-none sm:px-10">
              {soldOut ? "Sold out" : "Buy now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
