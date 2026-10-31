import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import { patchProfile, friendlyError } from "../../auth/authApi";
import ROUTES, { productPath, profilePath, registerPath } from "../../../constants/routes";
import { sizedImage } from "../../../utils/image";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";
import AvatarMenuModal from "./AvatarMenuModal";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";

import ShareButton from "../ProductDetails/ShareButton";
import OrderDispute from "../../orders/OrderDispute";



const money = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;
const idOf = (v) => String(v?._id ?? v ?? "");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
const isPublic = (p) => p.isShelved !== false && ["LISTED", "ACTIVE"].includes(p.status);

const ORDER_ERRORS = {
  ORDER_NOT_FOUND: "Order not found.",
  ORDER_NOT_CANCELLABLE: "This order can no longer be cancelled.",
  TOO_MANY_REQUESTS: "Too many requests. Please wait a minute.",
};
const orderError = (e) =>
  e.response ? ORDER_ERRORS[e.response.data?.error] || "Something went wrong. Please try again." : "Couldn't reach Sokodigi. Check your connection.";

const STATUS = {
  PROCESSING: ["Waiting for seller", "bg-amber-100 text-amber-800"],
  DISPATCHED: ["On the way", "bg-sky-100 text-sky-800"],
  DELIVERED: ["Completed", "bg-emerald-100 text-emerald-800"],
  CANCELLED: ["Cancelled", "bg-slate-200 text-slate-600"],
  DISPUTED: ["Under review", "bg-rose-100 text-rose-800"]
};

const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const lab = "mb-1 block text-[11px] font-bold uppercase text-slate-500";

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ShopProfileHeader({ memberProfile }) {
  return (
    <div className="bg-slate-50 p-6 rounded-3xl border flex justify-between items-center">
      <div>
        <h2 className="text-xl font-black">{memberProfile.brandName || "Member Shop"}</h2>
        <p className="text-xs text-slate-400">@{memberProfile.username}</p>
      </div>
      {/* Pass the vendor's username directly */}
      <ShareButton type="profile" targetIdentifier={memberProfile.username} />
    </div>
  );
}


/* ───────── Edit profile ───────── */
function EditProfileSheet({ brand, isMarketer, onClose, onSaved }) {
  const [f, setF] = useState({
    displayName: brand.displayName || "",
    bio: brand.bio || "",
    brandName: brand.brandName || "",
    county: brand.location?.county || "",
    address: brand.address || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    const body = { displayName: f.displayName.trim(), bio: f.bio.trim() };
    if (!body.displayName) return setError("Enter the name people will see.");
    if (isMarketer) {
      if (f.brandName.trim().length < 2) return setError("Enter your brand name.");
      if (f.county.trim().length < 2) return setError("Enter your county.");
      if (f.address.trim().length < 5) return setError("Enter your business address or town.");
      Object.assign(body, { brandName: f.brandName.trim(), address: f.address.trim(), location: { county: f.county.trim() } });
    }
    setBusy(true); setError("");
    try {
      const data = await patchProfile(body);
      onSaved(data.profile);
    } catch (x) { setError(friendlyError(x)); } finally { setBusy(false); }
  };

  return (
    <Sheet title="Edit profile" onClose={busy ? () => {} : onClose}>
      <form onSubmit={save} className="space-y-3">
        <div><label className={lab}>Display name</label><input className={field} maxLength={100} value={f.displayName} onChange={set("displayName")} /></div>
        {isMarketer && (
          <>
            <div><label className={lab}>Brand name</label><input className={field} maxLength={60} value={f.brandName} onChange={set("brandName")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={lab}>County</label><input className={field} maxLength={40} value={f.county} onChange={set("county")} /></div>
              <div><label className={lab}>Address / town</label><input className={field} maxLength={200} value={f.address} onChange={set("address")} /></div>
            </div>
          </>
        )}
        <div><label className={lab}>About you</label><textarea className={`${field} resize-none py-2`} rows={3} maxLength={500} value={f.bio} onChange={set("bio")} placeholder="Tell customers about yourself" /></div>
        <p className="text-[11px] text-slate-500">Your phone number and username are locked for payout safety. Contact support to change them.</p>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-11 flex-1 rounded-xl bg-emerald-700 text-xs font-bold text-white disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ───────── One order, shown the right way for buyer, seller or promoter ───────── */
function OrderCard({ order, myId, onChanged }) {
  const role = idOf(order.buyerId) === myId ? "buyer" : idOf(order.sellerId) === myId ? "seller" : "promoter";
  const f = order.financials || {};
  const status = order.orderStatus;
  const [label, tone] = STATUS[status] || [String(status || "").replace(/_/g, " "), "bg-slate-100 text-slate-600"];
  const open = ["PROCESSING", "DISPATCHED"].includes(status) && !order.isEscrowReleased;

  const [pinData, setPinData] = useState(null); // buyer only, fetched on demand
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const showPin = async () => {
    setBusy(true); setMsg("");
    try {
      const { data } = await apiClient.get(`/orders/${encodeURIComponent(order.orderNumber)}/pin`);
      setPinData({ pin: data.pin, qrPayload: data.qrPayload });
    } catch (e) { setMsg(orderError(e)); } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this order? You'll be refunded in full.")) return;
    setBusy(true); setMsg("");
    try { await apiClient.patch(`/orders/${encodeURIComponent(order.orderNumber)}/cancel`); onChanged(); }
    catch (e) { setMsg(orderError(e)); } finally { setBusy(false); }
  };

  const heading = role === "buyer" ? "Purchase" : role === "seller" ? "Sale" : "Promoted sale";
  const amountLabel = role === "buyer" ? "You paid" : role === "seller" ? "You receive" : "Your bonus";
  const amount = role === "buyer" ? f.totalRetailPaid : role === "seller" ? f.totalWholesaleToShop : f.totalCommissionSplit;
  const canCancel = role === "buyer" && status === "PROCESSING";

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{heading}</p><p className="font-mono text-sm font-bold text-slate-800">#{order.orderNumber}</p></div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>{label}</span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-600">
        {(order.items || []).map((it, i) => (
          <li key={`${it.productId}-${i}`} className="flex justify-between gap-3"><span>{it.name} × {it.quantity}</span><span className="font-semibold">{money(it.pricePaid * it.quantity)}</span></li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-KE") : ""}</span>
        <span className="font-black text-emerald-800">{amountLabel} {money(amount)}</span>
      </div>

      {(role === "buyer" || role === "seller") && <OrderDispute order={order} role={role} onChanged={onChanged} />}
      
      {role === "buyer" && open && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] leading-relaxed text-slate-500">
            {status === "PROCESSING" ? "Your payment is held in escrow. The seller will confirm your order soon." : "Your order is on its way. Give the seller your PIN only after it arrives."}
          </p>
          {!pinData ? (
            <button type="button" onClick={showPin} disabled={busy} className="min-h-11 w-full rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">Show my delivery PIN</button>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your delivery PIN</p>
              <p className="my-2 font-mono text-3xl font-black tracking-[0.3em] text-emerald-900">{pinData.pin}</p>
              <div className="mx-auto my-3 w-fit rounded-lg bg-white p-2"><QRCodeSVG value={pinData.qrPayload} size={140} level="M" /></div>
              <p className="text-[11px] leading-5 text-emerald-800">Show this to the seller <b>only after you receive your item</b>.</p>
              <button type="button" onClick={() => setPinData(null)} className="mt-2 text-[11px] font-bold text-emerald-700 underline">Hide</button>
            </div>
          )}
        </div>
      )}

      {role === "seller" && open && (
        <Link to={ROUTES.MEMBER_DASHBOARD} className="mt-3 flex min-h-11 items-center justify-center rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800">
          {status === "PROCESSING" ? "Confirm this order in your dashboard" : "Enter the buyer's PIN in your dashboard"}
        </Link>
      )}

      {status === "DELIVERED" && <p className="mt-3 text-xs font-bold text-emerald-700">✓ Completed</p>}
      {canCancel && <button type="button" onClick={cancel} disabled={busy} className="mt-3 text-[11px] font-bold text-red-600 underline disabled:opacity-50">Cancel order and get a refund</button>}
      {msg && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{msg}</p>}
    </article>
  );
}

/* ───────── Product card (whole card is one link) ───────── */
function ProductCard({ product, to, badge }) {
  const img = sizedImage(product.imageUrl, 500);
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
        {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">No image</div>}
        {badge && <span className="absolute left-2 top-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase text-amber-700">{badge}</span>}
      </div>
      <div className="p-3 sm:p-4">
        <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">{String(product.category || "general").replace(/-/g, " ")}</p>
        <h3 className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm font-black leading-5 text-slate-900">
          <Link to={to} className="after:absolute after:inset-0 after:content-[''] focus:outline-none">{product.name}</Link>
        </h3>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-base font-black text-slate-900 sm:text-lg">{money(product.price)}</span>
          {product.quantity !== undefined && <span className="text-[10px] font-semibold text-slate-400">{product.quantity} left</span>}
        </div>
      </div>
    </article>
  );
}

const Empty = ({ icon, text }) => (
  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center text-xs text-slate-500"><span className="mb-2 block text-3xl" aria-hidden="true">{icon}</span>{text}</p>
);

// Shrinks a photo to about 800px JPEG in the browser (phone photos are often 3 to 8 MB)
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 800 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("SHRINK_FAILED");
  return new File([blob], "profile.jpg", { type: "image/jpeg" });
}

/* ───────── Page ───────── */
export default function Profile() {
  const { username: usernameParam } = useParams();
  const navigate = useNavigate();
  const { auth, refreshProfile } = useAuth();
  const fileInputRef = useRef(null);

  const me = auth.user || {};
  const myProfile = auth.profile || {};
  const myId = idOf(me._id);
  const isOwnProfile = !usernameParam || (!!myProfile.username && usernameParam.toLowerCase() === myProfile.username);
  const isMarketer = auth.destination === "dashboard"; // active, paid marketer
  const showShop = !isOwnProfile || isMarketer;

  const [brand, setBrand] = useState(null);
  const [products, setProducts] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [shared, setShared] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const [orderFilter, setOrderFilter] = useState("active");
  const [matrix, setMatrix] = useState(null);
  const [matrixState, setMatrixState] = useState("idle"); // idle | loading | done | error
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [notice, setNotice] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [editing, setEditing] = useState(false);

  // ── Load the profile ──
  useEffect(() => {
    if (auth.loading) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true); setNotFound(false);
      try {
        if (isOwnProfile) {
          if (!auth.authenticated) { navigate(ROUTES.HOME, { replace: true }); return; }
          setBrand(myProfile);
          if (isMarketer) {
            const { data } = await apiClient.get("/products", { params: { sellerId: myId, status: "all", limit: 50 } });
            if (!cancelled) setProducts(data.feed || []);
          }
        } else {
          const { data } = await apiClient.get(`/profiles/${encodeURIComponent(usernameParam)}`);
          if (cancelled) return;
          setBrand(data.profile); setProducts(data.products || []); setFeatured(data.featured || []);
        }
      } catch (e) {
        if (!cancelled) { if (e.response?.status === 404) setNotFound(true); else console.error("Profile load failed:", e); }
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.authenticated, isOwnProfile, usernameParam, myId, isMarketer]);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/orders", { params: { limit: 30 } });
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Orders load failed:", e); setOrders([]); } finally { setOrdersLoaded(true); }
  }, []);

  const fetchShared = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/products/shared", { params: isOwnProfile ? {} : { username: usernameParam } });
      setShared(data.products || []);
    } catch (e) { console.error("Shared load failed:", e); setShared([]); }
  }, [isOwnProfile, usernameParam]);

  const tabs = [
    ...(showShop ? [{ id: "products", label: "Products" }, { id: "shared", label: "Shared" }] : []),
    ...(isOwnProfile ? [{ id: "orders", label: "Orders" }] : []),
    ...(isOwnProfile && isMarketer ? [{ id: "network", label: "Network" }] : []),
    { id: "about", label: "About" },
  ];
  const tab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  useEffect(() => { if (tab === "orders" && isOwnProfile) fetchOrders(); }, [tab, isOwnProfile, fetchOrders]);
  useEffect(() => { if (tab === "shared" && showShop) fetchShared(); }, [tab, showShop, fetchShared]);
  useEffect(() => {
    if (tab !== "network" || matrixState !== "idle") return;
    setMatrixState("loading");
    apiClient.get("/network/matrix-metrics")
      .then(({ data }) => { setMatrix(data?.ok ? data : null); setMatrixState("done"); })
      .catch(() => setMatrixState("error"));
  }, [tab, matrixState]);

const onAvatarFile = async (e) => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  if (!AVATAR_TYPES.includes(file.type)) return setNotice("Please choose a JPG, PNG or WebP image.");
  if (file.size > 15 * 1024 * 1024) return setNotice("That photo is too large. Choose one under 15 MB.");
  setUpdatingAvatar(true); setNotice("");
  try {
    const small = await shrinkPhoto(file);
    const url = await uploadImageToCloudinary(small, "profiles", () => auth.currentUser.getIdToken());
    const saved = await patchProfile({ profilePhoto: url });
    const finalUrl = saved?.profile?.profilePhoto;
    if (finalUrl !== url) throw new Error("NOT_SAVED"); // the server kept the old photo
    setBrand((b) => ({ ...(b || {}), profilePhoto: finalUrl }));
    setAvatarOpen(false);
    window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: { profilePhoto: finalUrl } }));
    await refreshProfile();
    setNotice("Profile photo updated.");
    setTimeout(() => setNotice(""), 3000);
  } catch (err) {
    console.error("Avatar update failed:", err);
    setNotice(
      err.message === "UPLOAD_FAILED" ? "Image upload failed. Check your connection."
      : err.message === "NOT_SAVED" ? "The photo uploaded but couldn't be saved. Please try again."
      : err.message === "SHRINK_FAILED" ? "That image couldn't be read. Try another photo."
      : err.code ? friendlyError(err) : "Couldn't update your picture. Please try again."
    );
  } finally { setUpdatingAvatar(false); }
};

  const copy = async (text, okMsg) => {
    try { await navigator.clipboard.writeText(text); setNotice(okMsg); setTimeout(() => setNotice(""), 2500); }
    catch { setNotice("Couldn't copy. Please copy it manually."); }
  };

  if (loading || auth.loading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <div className="h-64 animate-pulse rounded-3xl bg-slate-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }
  if (notFound || !brand) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="text-sm font-bold text-slate-700">This shop isn't available.</p>
        <Link to={ROUTES.MARKETPLACE} className="mt-3 inline-block text-xs font-bold text-emerald-700 underline">Back to the MarketHub</Link>
      </div>
    );
  }

  const displayName = brand.displayName || [brand.firstName, brand.lastName].filter(Boolean).join(" ") || "Sokodigi Member";
  const avatar = sizedImage(brand.profilePhoto, 300);
  const planNum = Number(String(me.plan || "").replace("phase", "")) || 0;
  const levelLabel = isOwnProfile ? (planNum ? `Phase ${planNum}` : "Member") : cap(brand.marketerLevel || "member");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shopUrl = brand.username ? `${origin}${profilePath(brand.username)}` : "";
  const pendingMarketer = isOwnProfile && me.accountCategory === "network" && !isMarketer;
  const expired = me.membershipStatus === "expired";
  const shownOrders = orders.filter((o) => (orderFilter === "active" ? ["PROCESSING", "DISPATCHED"].includes(o.orderStatus) : !["PROCESSING", "DISPATCHED"].includes(o.orderStatus)));
  const chip = (a) => `shrink-0 rounded-full px-4 py-2 text-xs font-bold ${a ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600"}`;

  return (
    <main className="min-h-screen bg-slate-50/60 pb-24 lg:pb-10">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarFile} className="hidden" />
      <AvatarMenuModal isOpen={avatarOpen} onClose={() => setAvatarOpen(false)} currentImageUrl={brand.profilePhoto || ""} isOwnProfile={isOwnProfile} onUploadClick={() => fileInputRef.current?.click()} />

      <div className="mx-auto max-w-5xl px-3 py-4 sm:px-6 md:py-8">
        {pendingMarketer && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span>{expired ? "Your membership has expired, so your shop is paused. Renew to bring it back." : "Your marketer shop isn't live yet. Activate your membership to start selling."}</span>
            <Link to={ROUTES.MEMBERSHIP} className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 font-bold text-white hover:bg-amber-700">{expired ? "Renew" : "Activate"}</Link>
          </div>
        )}

        {/* Header */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-24 bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-600 sm:h-36" />
          <div className="px-4 pb-5 sm:px-8">
            <div className="-mt-12 flex flex-col items-center gap-4 sm:-mt-14 sm:flex-row sm:items-end">
              <button type="button" onClick={() => isOwnProfile && setAvatarOpen(true)} aria-label={isOwnProfile ? "Change profile picture" : displayName}
                className={`relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-emerald-50 shadow-lg ring-2 ring-emerald-500 sm:h-28 sm:w-28 ${isOwnProfile ? "cursor-pointer" : "cursor-default"}`}>
                {avatar ?<img key={avatar} src={avatar} alt={displayName} className="h-full w-full object-cover" /> : <span className="text-4xl font-black text-emerald-700">{displayName.charAt(0).toUpperCase()}</span>}
                {updatingAvatar && <div className="absolute inset-0 flex items-center justify-center bg-black/50"><div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" /></div>}
              </button>

              <div className="min-w-0 flex-1 text-center sm:pb-1 sm:text-left">
                <h1 className="truncate text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{displayName}</h1>
                <p className="text-sm text-slate-500">{brand.username ? `@${brand.username}` : isOwnProfile ? "Buyer account" : ""}{brand.brandName && brand.username ? ` · ${brand.brandName}` : ""}</p>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {showShop && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">{levelLabel}</span>}
                  {isOwnProfile && brand.membershipNumber && <span className="rounded-full border border-slate-200 px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">#{brand.membershipNumber}</span>}
                  {!isOwnProfile && brand.location?.county && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">📍 {brand.location.county}</span>}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2">
                {isOwnProfile && <button type="button" onClick={() => setEditing(true)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:border-emerald-300">Edit profile</button>}
                {isOwnProfile && isMarketer && <Link to={ROUTES.MEMBER_DASHBOARD} className="flex min-h-10 items-center rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800">Manage shop</Link>}
                  {isOwnProfile && !isMarketer && me.accountCategory !== "network" && (
                    <p className="mt-3 text-center sm:text-left">
                      <Link to={ROUTES.JOIN_SHOP} className="text-xs font-bold text-emerald-700 underline">Work at a shop? Join with an invite code</Link>
                    </p>
                  )}
                {shopUrl && <button type="button" onClick={() => copy(shopUrl, "Shop link copied")} className="min-h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:border-emerald-300">Share shop</button>}
                {isOwnProfile && isMarketer && brand.username && <button type="button" onClick={() => copy(`${origin}${registerPath(brand.username)}`, "Invite link copied")} className="min-h-10 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-bold text-emerald-800">Copy invite link</button>}
              </div>
            </div>

            {brand.bio && <p className="mx-auto mt-4 max-w-3xl text-center text-sm leading-6 text-slate-600 sm:mx-0 sm:text-left">{brand.bio}</p>}
          </div>
        </section>

        {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-center text-xs font-bold text-emerald-800">{notice}</p>}

        {/* Featured (public shops) */}
        {!isOwnProfile && featured.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-3 text-sm font-black text-slate-900">Featured</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">{featured.map((p) => <ProductCard key={p._id} product={p} to={productPath(p._id)} badge="Featured" />)}</div>
          </section>
        )}

        {/* Tabs */}
        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex overflow-x-auto border-b border-slate-100" role="group" aria-label="Profile sections">
            {tabs.map((t) => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} aria-pressed={tab === t.id}
                className={`shrink-0 border-b-2 px-5 py-3.5 text-xs font-black ${tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-700"}`}>{t.label}</button>
            ))}
          </div>

          <div className="p-4 sm:p-6">
            {tab === "products" && (
              <>
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div><h2 className="text-lg font-black text-slate-900">{isOwnProfile ? "Your storefront" : "Products"}</h2>
                    <p className="text-xs text-slate-500">{isOwnProfile ? "Hidden items are marked. Manage everything in your dashboard." : `${products.length} ${products.length === 1 ? "product" : "products"} from this shop.`}</p></div>
                </div>
                {products.length === 0 ? <Empty icon="🛍️" text={isOwnProfile ? "You haven't added any products yet." : "This shop has no products right now."} /> : (
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
                    {products.map((p) => <ProductCard key={p._id} product={p} to={productPath(p._id)} badge={isOwnProfile && !isPublic(p) ? "Hidden" : undefined} />)}
                  </div>
                )}
              </>
            )}

            {tab === "shared" && (
              <>
                <h2 className="text-lg font-black text-slate-900">Shared store</h2>
                <p className="mb-4 text-xs text-slate-500">{isOwnProfile ? "Products you promote. You earn a 5% bonus on sales through your link." : "Products this shop recommends from other sellers."}</p>
                {shared.length === 0 ? <Empty icon="🔗" text={isOwnProfile ? "Open any product and tap “Copy my share link” to start promoting it." : "Nothing shared yet."} /> : (
                  <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
                    {shared.map((p) => <ProductCard key={p._id} product={p} badge="Promoted" to={`${productPath(p._id)}?ref=${encodeURIComponent(p.shareCode)}`} />)}
                  </div>
                )}
              </>
            )}

            {tab === "orders" && isOwnProfile && (
              <>
                <h2 className="text-lg font-black text-slate-900">My orders</h2>
                <p className="mb-3 text-xs text-slate-500">Your purchases{isMarketer ? ", and sales from your shop" : ""}.</p>
                <div className="mb-4 flex gap-2" role="group" aria-label="Filter orders">
                  <button type="button" className={chip(orderFilter === "active")} aria-pressed={orderFilter === "active"} onClick={() => setOrderFilter("active")}>In progress</button>
                  <button type="button" className={chip(orderFilter === "past")} aria-pressed={orderFilter === "past"} onClick={() => setOrderFilter("past")}>Completed &amp; cancelled</button>
                </div>
                {!ordersLoaded ? <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
                  : shownOrders.length > 0 ? <div className="grid gap-4 md:grid-cols-2">{shownOrders.map((o) => <OrderCard key={o._id} order={o} myId={myId} onChanged={fetchOrders} />)}</div>
                  : <Empty icon="📦" text={orderFilter === "active" ? "No orders in progress." : "No completed or cancelled orders yet."} />}
              </>
            )}

            {tab === "network" && isOwnProfile && (
              <>
                <h2 className="text-lg font-black text-slate-900">Your network</h2>
                <p className="mb-4 text-xs text-slate-500">Members under you, up to four levels. <Link to={ROUTES.MY_TEAM} className="font-bold text-emerald-700 underline">See your team</Link></p>
                {matrixState === "loading" && <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />}
                {matrixState === "error" && <p className="text-xs font-semibold text-red-600">Couldn't load your network. <button type="button" onClick={() => setMatrixState("idle")} className="underline">Try again</button></p>}
                {matrixState === "done" && !matrix && <Empty icon="🌐" text="No network data yet." />}
                {matrixState === "done" && matrix && (
                  <div className="space-y-5">
                    <div className="grid grid-cols-3 gap-3">
                      {[["Network", matrix.summary?.totalDownline || 0, ""], ["Active", matrix.summary?.activeDownline || 0, "text-emerald-600"], ["Placed by us", `${matrix.spilloverMetrics?.spilloverRatePercentage || 0}%`, ""]].map(([l, v, c]) => (
                        <div key={l} className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-center"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{l}</p><p className={`mt-1 text-xl font-black ${c || "text-slate-900"}`}>{v}</p></div>
                      ))}
                    </div>
                    <MatrixTreeChart generations={matrix.generations} />
                    <LegDistributionCards legBalanceMatrix={matrix.legBalanceMatrix} spilloverMetrics={matrix.spilloverMetrics} />
                  </div>
                )}
              </>
            )}

            {tab === "about" && (
              <dl className="grid gap-5 rounded-2xl border border-slate-200 p-5 sm:grid-cols-2">
                {[
                  ["Username", brand.username ? `@${brand.username}` : "—"],
                  ["Brand", brand.brandName || "—"],
                  ["County", brand.location?.county || "—"],
                  ...(isOwnProfile ? [["Membership number", brand.membershipNumber || "Not yet issued"], ["Payout phone", brand.phoneNumber ? `${brand.phoneNumber.slice(0, 6)}***${brand.phoneNumber.slice(-3)}` : "Not set"]] : []),
                ].map(([l, v]) => <div key={l}><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">{l}</dt><dd className="mt-1 text-sm font-semibold text-slate-800">{v}</dd></div>)}
              </dl>
            )}
          </div>
        </section>
      </div>

      {editing && <EditProfileSheet brand={brand} isMarketer={isMarketer} onClose={() => setEditing(false)} onSaved={(p) => { setBrand((b) => ({ ...b, ...p })); setEditing(false); setNotice("Profile updated."); refreshProfile(); }} />}
    </main>
  );
}
