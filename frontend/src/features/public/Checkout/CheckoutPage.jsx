import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES, { productPath } from "../../../constants/routes";

const REF_RE = /^[A-Za-z0-9_-]{8,32}$/;
const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;

const MESSAGES = {
  INSUFFICIENT_FUNDS: "Your wallet balance is too low for this order.",
  INSUFFICIENT_STOCK: "Sorry, there isn't enough stock left for that quantity.",
  PRODUCT_NOT_FOUND: "This product is no longer available.",
  WALLET_FROZEN: "Your wallet is frozen. Please contact support.",
  WALLET_NOT_FOUND: "We couldn't find your wallet. Please sign out and in again.",
  SELF_PURCHASE_NOT_ALLOWED: "You can't buy your own product.",
  SHIPPING_DETAILS_INVALID: "Please check your delivery details.",
  INVALID_QUANTITY: "Please choose a valid quantity.",
  AMOUNT_TOO_SMALL: "This order amount is too small to process.",
  TOO_MANY_REQUESTS: "You're going too fast. Please wait a minute and try again.",
  NETWORK_ERROR:
    "We couldn't confirm your order. Before trying again, check your wallet balance: if it dropped, your order went through.",
};

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString()}`;

export default function CheckoutPage() {
  const { state } = useLocation(); // { productId, quantity, shareCode } from the product page
  const { auth } = useAuth();
  const navigate = useNavigate();
  const submitting = useRef(false);

  const productId = typeof state?.productId === "string" ? state.productId : null;
  const quantity = Number.isInteger(state?.quantity) && state.quantity >= 1 ? state.quantity : 1;
  const storedRef = productId ? sessionStorage.getItem(`sokodigi_ref_${productId}`) : null;
  const rawRef = state?.shareCode || storedRef;
  const shareCode = rawRef && REF_RE.test(rawRef) ? rawRef : undefined; // the server verifies it belongs to a real promoter

  const profile = auth.profile || {};
  const [form, setForm] = useState(() => ({
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    phoneNumber: profile.phoneNumber || "",
    county: profile.location?.county || "",
    subCounty: profile.location?.subCounty || "",
    deliveryNotes: "",
  }));

  const [product, setProduct] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(Boolean(productId));
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [placed, setPlaced] = useState(null);

  // Fresh price and stock from the server, plus the wallet balance
  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [p, w] = await Promise.all([
          apiClient.get(`/products/${productId}`),
          apiClient.get("/wallet/my-balance"),
        ]);
        if (cancelled) return;
        setProduct(p.data.product || null);
        setBalance(w.data.balance ?? 0);
      } catch (e) {
        console.error("Checkout load failed:", e);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const setField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  if (!productId) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        No active checkout session.{" "}
        <Link to={ROUTES.MARKETPLACE} className="underline text-emerald-700">Back to the marketplace</Link>
      </div>
    );
  }
  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>;
  }
  if (loadError || !product) {
    return (
      <div className="p-8 text-center text-xs text-slate-500">
        We couldn't load this product.{" "}
        <Link to={ROUTES.MARKETPLACE} className="underline text-emerald-700">Back to the marketplace</Link>
      </div>
    );
  }

  const stock = product.quantity || 0;
  const delivery = product.deliveryFee || 0;
  const subtotal = product.price * quantity;
  const total = subtotal + delivery;
  const isOwner = auth.user?._id && String(auth.user._id) === String(product.sellerId);
  const short = balance !== null && balance < total;

  /* ───────── Success: the PIN must stay visible on the page ───────── */
  if (placed) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center space-y-4">
        <h1 className="text-xl font-black text-slate-900">Order placed 🎉</h1>
        <p className="text-sm text-slate-600">
          Order <b>{placed.orderNumber}</b> · {fmt(placed.totalAmountLocked)} is held safely in escrow.
        </p>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="text-[11px] font-bold uppercase text-emerald-700">Your delivery PIN</p>
          <p className="font-mono text-4xl font-black tracking-[0.3em] text-emerald-800 my-2">{placed.deliveryReleasePin}</p>
          <p className="text-xs text-slate-600">
            Give this PIN to the seller <b>only after you receive your item</b>. They enter it to release the payment. Never share it before delivery.
          </p>
        </div>
        <p className="text-[11px] text-slate-400">Write it down now. You can also find it later in your orders.</p>
        <div className="flex gap-2 justify-center">
          <Link to={ROUTES.MARKETPLACE} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold">Keep shopping</Link>
          <Link to={ROUTES.WALLET} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold">View wallet</Link>
        </div>
      </div>
    );
  }

  const handlePlaceOrder = async (e) => {
    e.preventDefault();
    if (submitting.current) return; // a ref blocks a double-tap before state updates
    setError(null);

    const fullName = form.fullName.trim();
    const phone = form.phoneNumber.replace(/[\s-]/g, "");
    const county = form.county.trim();
    const subCounty = form.subCounty.trim();
    if (!fullName || !county || !subCounty) return setError({ code: "SHIPPING_DETAILS_INVALID" });
    if (!PHONE_RE.test(phone)) return setError({ code: "SHIPPING_DETAILS_INVALID", text: "Enter a valid Kenyan phone number, e.g. 0712345678." });
    if (quantity > stock) return setError({ code: "INSUFFICIENT_STOCK" });

    submitting.current = true;
    setBusy(true);
    try {
      const { data } = await apiClient.post("/orders", {
        productId: product._id,
        quantity,
        shareCode, // omitted when undefined. Prices and promoter ids are never sent.
        shippingDetails: {
          fullName,
          phoneNumber: phone.startsWith("0") ? `254${phone.slice(1)}` : phone.replace(/^\+/, ""),
          county,
          subCounty,
          deliveryNotes: form.deliveryNotes.trim(),
        },
      });
      sessionStorage.removeItem(`sokodigi_ref_${product._id}`);
      setPlaced(data.order);
    } catch (err) {
      console.error("Checkout submission failure:", err);
      const d = err.response?.data || {};
      setError(
        err.response
          ? { code: d.error || "REQUEST_FAILED", deficit: d.deficit, currentBalance: d.currentBalance }
          : { code: "NETWORK_ERROR" }
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const input = "w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-emerald-600";
  const label = "block text-[11px] font-bold text-slate-500 uppercase mb-1";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-6">Secure Escrow Checkout</h1>

      <div className="grid gap-8 md:grid-cols-5">
        <form onSubmit={handlePlaceOrder} className="md:col-span-3 space-y-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-xs">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Delivery details</h2>

          {error && (
            <div role="alert" className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold space-y-1">
              <p>{error.text || MESSAGES[error.code] || "Something went wrong. Please try again."}</p>
              {error.code === "INSUFFICIENT_FUNDS" && error.deficit != null && (
                <p>You need {fmt(error.deficit)} more. <Link to={ROUTES.WALLET} className="underline font-bold">Top up your wallet</Link></p>
              )}
              {error.code === "INSUFFICIENT_STOCK" && (
                <p><Link to={productPath(product._id)} className="underline font-bold">Back to the product</Link></p>
              )}
            </div>
          )}

          <div>
            <label className={label} htmlFor="fullName">Full name</label>
            <input id="fullName" required autoComplete="name" maxLength={80} value={form.fullName} onChange={setField("fullName")} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone number (for the delivery person)</label>
            <input id="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="0712345678" value={form.phoneNumber} onChange={setField("phoneNumber")} className={`${input} font-mono`} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label} htmlFor="county">County</label>
              <input id="county" required maxLength={40} placeholder="e.g. Kisumu" value={form.county} onChange={setField("county")} className={input} />
            </div>
            <div>
              <label className={label} htmlFor="subCounty">Sub-county</label>
              <input id="subCounty" required maxLength={40} placeholder="e.g. Kisumu Central" value={form.subCounty} onChange={setField("subCounty")} className={input} />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="notes">Delivery notes (optional)</label>
            <textarea id="notes" rows={2} maxLength={300} placeholder="Landmark, pickup station, gate colour…" value={form.deliveryNotes} onChange={setField("deliveryNotes")} className={`${input} resize-none`} />
          </div>

          {isOwner ? (
            <p className="text-xs text-slate-500">This is your own product, so you can't order it.</p>
          ) : stock < 1 ? (
            <p className="text-xs font-bold text-red-600">This item is sold out.</p>
          ) : (
            <button
              type="submit"
              disabled={busy || short || quantity > stock}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition mt-2 shadow-sm cursor-pointer"
            >
              {busy ? "Securing your payment…" : `Pay ${fmt(total)} from wallet`}
            </button>
          )}
          {short && !isOwner && stock > 0 && (
            <p className="text-xs text-amber-700">
              Your wallet is {fmt(total - balance)} short. <Link to={ROUTES.WALLET} className="underline font-bold">Top up</Link>
            </p>
          )}
        </form>

        <div className="md:col-span-2 space-y-4">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Your order</h2>
            <div className="flex items-start space-x-3">
              {product.imageUrl ? (
                <img src={product.imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover bg-white border border-slate-200 flex-shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex-shrink-0" />
              )}
              <div>
                <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{product.name}</h3>
                <p className="text-xs text-slate-400 font-medium">Qty {quantity} × {fmt(product.price)}</p>
              </div>
            </div>
            <div className="border-t border-slate-200 mt-4 pt-4 space-y-2 text-xs font-medium text-slate-600">
              <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{fmt(subtotal)}</span></div>
              <div className="flex justify-between"><span>Delivery</span><span className="font-mono">{fmt(delivery)}</span></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold text-slate-900 text-sm">
                <span>Total</span><span className="font-mono text-emerald-600">{fmt(total)}</span>
              </div>
              {balance !== null && (
                <div className="flex justify-between text-[11px] text-slate-400"><span>Wallet balance</span><span className="font-mono">{fmt(balance)}</span></div>
              )}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">
              Your payment is held in escrow and only released to the seller when you give them your delivery PIN.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
