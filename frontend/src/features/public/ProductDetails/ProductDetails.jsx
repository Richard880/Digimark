import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES from "../../../constants/routes";

const REF_RE = /^[A-Za-z0-9_-]{8,32}$/;

export default function ProductDetails() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { auth } = useAuth();
  const navigate = useNavigate();

  const signedIn = auth.authenticated;
  const isMarketer = auth.destination === "dashboard"; // active, paid marketer

  const [product, setProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("description");
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
  }, [id, fetchProduct]);

  const isOwner = !!(auth.user?._id && product && String(auth.user._id) === String(product.sellerId));
  const stock = product?.quantity || 0;

  const handleProceedToCheckout = () => {
    if (!signedIn) return setNotice("Please sign in to place an order.");
    if (stock < 1) return setNotice("This item is sold out.");

    // Only a well-formed code is ever passed on. The server verifies it belongs to a real promoter.
    const stored = sessionStorage.getItem(`sokodigi_ref_${product._id}`);
    const shareCode = stored && REF_RE.test(stored) ? stored : undefined;

    navigate(ROUTES.CHECKOUT, {
      state: {
        productId: product._id,
        quantity,
        shareCode,        // <-- CheckoutPage must send this to POST /api/orders
        product,          // display only: the server re-reads the price from the database
      },
    });
  };

  const handleInitiateTraderChat = () => {
    if (!signedIn) return setNotice("Please sign in to message traders.");
    navigate(`${ROUTES.MESSAGES}?targetUser=${product.sellerId}&initMsg=true`);
  };

  const handleShelfToggle = async () => {
    setBusy(true);
    setNotice("");
    try {
      await apiClient.patch(`/products/${id}/toggle-shelf`);
      setNotice("Storefront updated.");
      await fetchProduct();
    } catch (err) {
      console.error("Toggle shelf failed:", err);
      setNotice("Couldn't update your storefront. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Marketers (not the owner) get a personal link that credits them the 5% promoter bonus
  const handleCopyShareLink = async () => {
    setBusy(true);
    setNotice("");
    try {
      const { data } = await apiClient.post(`/products/${id}/share`);
      await navigator.clipboard.writeText(data.shareUrl);
      setNotice("Your share link was copied. You earn the promoter bonus on sales through it.");
    } catch (err) {
      console.error("Share link failed:", err);
      setNotice("Couldn't create your share link. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50/50">
        <div className="w-8 h-8 border-4 border-emerald-600/20 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!product) {
    return <div className="text-center py-12 text-slate-500 text-xs">This product could not be found.</div>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 md:grid-cols-2">
        {/* Image */}
        <div className="rounded-2xl border border-slate-200 bg-white p-2 overflow-hidden shadow-xs h-96 flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="max-h-full max-w-full object-contain rounded-xl" />
          ) : (
            <span className="text-xs font-bold text-slate-300">No image</span>
          )}
        </div>

        <div className="flex flex-col justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight sm:text-3xl">{product.name}</h1>
            {product.brandName && <p className="text-xs text-slate-400 mt-1">by {product.brandName}</p>}

            <div className="mt-4 flex items-baseline space-x-2">
              <span className="text-3xl font-black text-emerald-600 tracking-tight">Ksh {product.price?.toLocaleString()}</span>
              {product.deliveryFee > 0 && (
                <span className="text-xs text-slate-400 font-medium">+ Ksh {product.deliveryFee.toLocaleString()} delivery</span>
              )}
            </div>

            {/* Marketer strip. The server only sends commission data to marketers. */}
            {isMarketer && product.affiliateCommission != null && (
              <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Promoter bonus</span>
                  <span className="text-sm font-bold text-emerald-700">+Ksh {product.affiliateCommission.toLocaleString()} per sale</span>
                </div>
                {isOwner ? (
                  <button
                    onClick={handleShelfToggle}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                  >
                    📌 {product.isShelved ? "Remove from my storefront" : "Show on my storefront"}
                  </button>
                ) : (
                  <button
                    onClick={handleCopyShareLink}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                  >
                    🔗 Copy my share link
                  </button>
                )}
              </div>
            )}

            {/* Quantity */}
            <div className="mt-6 flex items-center space-x-4 border-t border-slate-100 pt-6">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity:</span>
              <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={stock < 1}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold border-r border-slate-200"
                >
                  -
                </button>
                <span className="px-4 text-sm font-mono font-bold text-slate-800">{stock < 1 ? 0 : quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(stock, q + 1))}
                  disabled={stock < 1}
                  className="px-3 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 font-bold border-l border-slate-200"
                >
                  +
                </button>
              </div>
              <span className="text-xs text-slate-400 font-semibold">
                {stock < 1 ? "Sold out" : `(${stock} in stock)`}
              </span>
            </div>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-6 space-y-3">
            {notice && (
              <p role="status" className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700">
                {notice}
              </p>
            )}

            {isOwner ? (
              <p className="text-xs text-slate-500">This is your own product, so you can't order it.</p>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleProceedToCheckout}
                  disabled={stock < 1}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center cursor-pointer"
                >
                  {stock < 1 ? "Sold out" : "Proceed to Escrow Checkout"}
                </button>

                <button
                  type="button"
                  onClick={handleInitiateTraderChat}
                  className="w-full py-3.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 font-bold text-xs uppercase tracking-wider transition shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  Inquire / Negotiate With Trader
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-12 border-t border-slate-200 pt-8">
        <div className="flex space-x-4 border-b border-slate-200 pb-px">
          <button
            onClick={() => setActiveTab("description")}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
              activeTab === "description" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}
          >
            Product Info
          </button>
          {isOwner && (
            <button
              onClick={() => setActiveTab("earnings")}
              className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 transition ${
                activeTab === "earnings" ? "border-slate-900 text-slate-900" : "border-transparent text-slate-400 hover:text-slate-600"
              }`}
            >
              Your Earnings
            </button>
          )}
        </div>

        <div className="mt-6 text-sm text-slate-600 leading-relaxed max-w-3xl">
          {activeTab === "description" || !isOwner ? (
            <p>{product.description || "The seller hasn't added a description yet."}</p>
          ) : (
            <div className="space-y-2 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <p className="text-xs font-bold text-slate-700">What you receive per sale:</p>
              <ul className="text-xs space-y-1.5 font-medium text-slate-500 list-disc list-inside">
                <li>
                  Sold directly: <span className="font-mono text-slate-800 font-bold">
                    Ksh {(product.price - Math.round(product.price * 0.01)).toLocaleString()}
                  </span>
                </li>
                <li>
                  Sold through a promoter: <span className="font-mono text-slate-800 font-bold">
                    Ksh {(product.wholesalePrice ?? 0).toLocaleString()}
                  </span>
                </li>
              </ul>
              <p className="text-[11px] text-slate-400">After Sokodigi's 1% fee, and the 5% promoter bonus when applicable. Delivery fees are paid to you in full.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
