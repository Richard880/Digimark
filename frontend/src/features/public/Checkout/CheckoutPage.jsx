import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "react-router-dom";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES, { productPath } from "../../../constants/routes";
import { sizedImage } from "../../../utils/image";
import PushAsk from "../../../pwa/PushAsk

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
  NETWORK_ERROR: "We couldn't confirm your order. Before trying again, check your wallet balance: if it dropped, your order went through.",
};

const fmt = (n) => `Ksh ${Number(n || 0).toLocaleString("en-KE")}`;

function Steps({ current }) {
  const steps = ["Product", "Delivery", "Done"];
  return (
    <ol className="mb-5 flex items-center gap-2 text-[11px] font-bold" aria-label="Checkout progress">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2" aria-current={i === current ? "step" : undefined}>
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${i <= current ? "bg-emerald-700 text-white" : "bg-slate-200 text-slate-500"}`}>{i < current ? "✓" : i + 1}</span>
          <span className={i === current ? "text-emerald-900" : "text-slate-400"}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-6 bg-slate-300" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export default function CheckoutPage() {
  const { state } = useLocation(); // { productId, quantity, shareCode } from the product page
  const { auth } = useAuth();
  const submitting = useRef(false);

  const productId = typeof state?.productId === "string" ? state.productId : null;
  const quantity = Number.isInteger(state?.quantity) && state.quantity >= 1 ? state.quantity : 1;
  const storedRef = productId ? sessionStorage.getItem(`sokodigi_ref_${productId}`) : null;
  const rawRef = state?.shareCode || storedRef;
  const shareCode = rawRef && REF_RE.test(rawRef) ? rawRef : undefined; // the server verifies it belongs to a real promoter

  const profile = auth.profile || {};
  const [form, setForm] = useState(() => ({
    fullName: [profile.firstName, profile.lastName].filter(Boolean).join(" "),
    phoneNumber: profile.phoneNumber ? `0${String(profile.phoneNumber).slice(3)}` : "",
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
  const [copied, setCopied] = useState(false);

  // Fresh price and stock from the server, plus the wallet balance
  useEffect(() => {
    if (!productId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const [p, w] = await Promise.all([apiClient.get(`/products/${productId}`), apiClient.get("/wallet/my-balance")]);
        if (cancelled) return;
        setProduct(p.data.product || null);
        setBalance(w.data.balance ?? 0);
      } catch (e) {
        console.error("Checkout load failed:", e);
        if (!cancelled) setLoadError(true);
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const setField = (name) => (e) => setForm((prev) => ({ ...prev, [name]: e.target.value }));

  if (!productId) {
    return <div className="p-8 text-center text-xs text-slate-500">No active checkout. <Link to={ROUTES.MARKETPLACE} className="font-bold text-emerald-700 underline">Back to the MarketHub</Link></div>;
  }
  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
        <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (loadError || !product) {
    return <div className="p-8 text-center text-xs text-slate-500">We couldn't load this product. <Link to={ROUTES.MARKETPLACE} className="font-bold text-emerald-700 underline">Back to the MarketHub</Link></div>;
  }

  const stock = product.quantity || 0;
  const delivery = product.deliveryFee || 0;
  const subtotal = product.price * quantity;
  const total = subtotal + delivery;
  const isOwner = auth.user?._id && String(auth.user._id) === String(product.sellerId);
  const short = balance !== null && balance < total;
  const cannotPay = isOwner || stock < 1 || quantity > stock;

  /* ───────── Success: the PIN must stay visible ───────── */
  if (placed) {
    const copyPin = async () => {
      try { await navigator.clipboard.writeText(placed.deliveryReleasePin); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the PIN is on screen anyway */ }
    };
    return (
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Steps current={2} />
        <div className="text-center">
          <p className="text-4xl" aria-hidden="true">🎉</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Order placed</h1>
          <p className="mt-1 text-sm text-slate-600">Order <b>{placed.orderNumber}</b> · {fmt(placed.totalAmountLocked)} is held safely in escrow.</p>
        </div>
            <PushAsk reason="Get an alert when the seller confirms your order and when it's on its way." />
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Your delivery PIN</p>
          <p className="my-2 font-mono text-4xl font-black tracking-[0.3em] text-emerald-900">{placed.deliveryReleasePin}</p>
          <button type="button" onClick={copyPin} className="rounded-full bg-white px-4 py-1.5 text-xs font-bold text-emerald-800 shadow-sm">{copied ? "Copied ✓" : "Copy PIN"}</button>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">Give this PIN to the seller <b>only after you receive your item</b>. Never share it before delivery.</p>
        </div>

        <ol className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600">
          <li><b className="text-slate-900">1.</b> The seller prepares and delivers your order.</li>
          <li><b className="text-slate-900">2.</b> Check your item when it arrives.</li>
          <li><b className="text-slate-900">3.</b> Give the seller your PIN to release the payment.</li>
        </ol>
        <p className="text-center text-[11px] text-slate-400">Lost your PIN? Open it again anytime under My orders.</p>

        <div className="grid grid-cols-2 gap-2">
          <Link to={ROUTES.MY_PROFILE} className="flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 text-xs font-bold text-white">My orders</Link>
          <Link to={ROUTES.MARKETPLACE} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-100 text-xs font-bold text-slate-700">Keep shopping</Link>
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
          county, subCounty,
          deliveryNotes: form.deliveryNotes.trim(),
        },
      });
      sessionStorage.removeItem(`sokodigi_ref_${product._id}`);
      setPlaced(data.order);
      window.scrollTo?.({ top: 0 });
    } catch (err) {
      console.error("Checkout submission failure:", err);
      const d = err.response?.data || {};
      setError(err.response ? { code: d.error || "REQUEST_FAILED", deficit: d.deficit, currentBalance: d.currentBalance } : { code: "NETWORK_ERROR" });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const input = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
  const label = "mb-1 block text-[11px] font-bold uppercase text-slate-500";
  const payLabel = busy ? "Securing your payment…" : `Pay ${fmt(total)} from wallet`;
  const img = sizedImage(product.imageUrl, 200);

  return (
    <div className="mx-auto max-w-4xl px-4 pb-44 pt-5 sm:px-6 lg:pb-10">
      <Steps current={1} />
      <h1 className="mb-4 text-xl font-black text-slate-900">Secure checkout</h1>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-8">
        {/* Summary: first on phones */}
        <aside className="order-1 lg:order-2 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-24">
            <h2 className="mb-3 text-[11px] font-black uppercase tracking-wider text-slate-400">Your order</h2>
            <div className="flex items-center gap-3">
              {img ? <img src={img} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-white object-cover" /> : <div className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 bg-white" />}
              <div className="min-w-0">
                <Link to={productPath(product._id)} className="line-clamp-2 text-sm font-bold text-slate-900 hover:underline">{product.name}</Link>
                <p className="text-xs text-slate-500">Qty {quantity} × {fmt(product.price)}</p>
              </div>
            </div>
            <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs font-medium text-slate-600">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono">{fmt(subtotal)}</dd></div>
              <div className="flex justify-between"><dt>Delivery</dt><dd className="font-mono">{delivery > 0 ? fmt(delivery) : "Free"}</dd></div>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-black text-slate-900"><dt>Total</dt><dd className="font-mono text-emerald-700">{fmt(total)}</dd></div>
              {balance !== null && <div className="flex justify-between text-[11px] text-slate-400"><dt>Wallet balance</dt><dd className="font-mono">{fmt(balance)}</dd></div>}
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">🔒 Your payment is held in escrow and released to the seller only when you give them your delivery PIN.</p>
          </div>
        </aside>

        {/* Delivery form */}
        <form id="checkout-form" onSubmit={handlePlaceOrder} className="order-2 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:order-1 lg:col-span-3">
          <h2 className="text-[11px] font-black uppercase tracking-wider text-slate-400">Delivery details</h2>

          {error && (
            <div role="alert" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
              <p>{error.text || MESSAGES[error.code] || "Something went wrong. Please try again."}</p>
              {error.code === "INSUFFICIENT_FUNDS" && error.deficit != null && <p>You need {fmt(error.deficit)} more. <Link to={ROUTES.WALLET} className="font-bold underline">Top up your wallet</Link></p>}
              {error.code === "INSUFFICIENT_STOCK" && <p><Link to={productPath(product._id)} className="font-bold underline">Back to the product</Link></p>}
            </div>
          )}

          <div>
            <label className={label} htmlFor="fullName">Full name</label>
            <input id="fullName" required autoComplete="name" maxLength={80} value={form.fullName} onChange={setField("fullName")} className={input} />
          </div>
          <div>
            <label className={label} htmlFor="phone">Phone number (for the delivery person)</label>
            <input id="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="0712345678" value={form.phoneNumber} onChange={setField("phoneNumber")} className={input} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <textarea id="notes" rows={2} maxLength={300} placeholder="Landmark, pickup station, gate colour…" value={form.deliveryNotes} onChange={setField("deliveryNotes")} className={`${input} resize-none py-2`} />
          </div>

          {isOwner ? <p className="text-xs text-slate-500">This is your own product, so you can't order it.</p>
            : stock < 1 ? <p className="text-xs font-bold text-red-600">This item is sold out.</p>
            : (
              <button type="submit" disabled={busy || short || cannotPay} className="hidden min-h-12 w-full items-center justify-center rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:bg-slate-300 lg:flex">{payLabel}</button>
            )}
          {short && !cannotPay && <p className="text-xs font-semibold text-amber-700">Your wallet is {fmt(total - balance)} short. <Link to={ROUTES.WALLET} className="font-bold underline">Top up</Link></p>}
        </form>
      </div>

      {/* Sticky pay bar: phones and tablets, above the bottom tab bar */}
      {!cannotPay && (
        <div className="fixed inset-x-0 z-30 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden" style={{ bottom: "calc(3.75rem + env(safe-area-inset-bottom))" }}>
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total</p>
              <p className="truncate text-lg font-black text-emerald-800">{fmt(total)}</p>
            </div>
            <button type="submit" form="checkout-form" disabled={busy || short} className="ml-auto min-h-12 flex-1 rounded-xl bg-emerald-700 px-6 text-sm font-black text-white hover:bg-emerald-800 disabled:bg-slate-300 sm:flex-none sm:px-10">
              {busy ? "Securing…" : short ? "Top up to pay" : "Pay now"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
