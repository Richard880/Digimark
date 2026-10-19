import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import { patchProfile, friendlyError } from "../../auth/authApi";
import ROUTES, { productPath, profilePath, registerPath } from "../../../constants/routes";
import MatrixTreeChart from "../../vendor-dashboard/MatrixTreeChart";
import LegDistributionCards from "../../vendor-dashboard/LegDistributionCards";
import AvatarMenuModal from "./AvatarMenuModal";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";

const money = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;
const idOf = (v) => String(v?._id ?? v ?? "");
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];

const ORDER_ERRORS = {
  INVALID_RELEASE_PIN: "That PIN is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many wrong attempts. Try again in 15 minutes.",
  ALREADY_FULFILLED: "This order was already completed.",
  ORDER_NOT_FOUND: "Order not found.",
  ORDER_NOT_CANCELLABLE: "This order can no longer be cancelled.",
  INVALID_PIN_FORMAT: "Enter the 6-digit PIN.",
  TOO_MANY_REQUESTS: "Too many requests. Please wait a minute.",
};
const orderError = (e) =>
  e.response ? ORDER_ERRORS[e.response.data?.error] || "Something went wrong. Please try again." : "Couldn't reach Sokodigi. Check your connection.";

const Stat = ({ value, label, accent }) => (
  <div className="px-4 py-4 text-center">
    <p className={`text-xl font-black ${accent ? "text-emerald-700" : "text-slate-900"}`}>{value}</p>
    <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
  </div>
);

/* ───────────── One order, shown the right way for buyer, seller or promoter ───────────── */
function OrderCard({ order, myId, onChanged }) {
  const role = idOf(order.buyerId) === myId ? "buyer" : idOf(order.sellerId) === myId ? "seller" : "promoter";
  const f = order.financials || {};
  const status = order.orderStatus;
  const open = ["PROCESSING", "DISPATCHED"].includes(status) && !order.isEscrowReleased;
  const ship = order.shippingDetails;

  const [pinData, setPinData] = useState(null); // { pin, qrPayload }: buyer only, fetched on demand
  const [sellerPin, setSellerPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const showPin = async () => {
    setBusy(true); setMsg("");
    try {
      const { data } = await apiClient.get(`/orders/${encodeURIComponent(order.orderNumber)}/pin`);
      setPinData({ pin: data.pin, qrPayload: data.qrPayload });
    } catch (e) { setMsg(orderError(e)); } finally { setBusy(false); }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(sellerPin)) return setMsg(ORDER_ERRORS.INVALID_PIN_FORMAT);
    setBusy(true); setMsg("");
    try {
      await apiClient.patch(`/orders/${encodeURIComponent(order.orderNumber)}/fulfill-handshake`, { pin: sellerPin });
      setSellerPin("");
      onChanged();
    } catch (err) { setMsg(orderError(err)); } finally { setBusy(false); }
  };

  const cancel = async () => {
    if (!window.confirm("Cancel this order? The buyer is refunded in full.")) return;
    setBusy(true); setMsg("");
    try {
      await apiClient.patch(`/orders/${encodeURIComponent(order.orderNumber)}/cancel`);
      onChanged();
    } catch (err) { setMsg(orderError(err)); } finally { setBusy(false); }
  };

  const amountLabel = role === "buyer" ? "You paid" : role === "seller" ? "You receive" : "Your bonus";
  const amount = role === "buyer" ? f.totalRetailPaid : role === "seller" ? f.totalWholesaleToShop : f.totalCommissionSplit;
  const canCancel = open && (role === "seller" || (role === "buyer" && status === "PROCESSING"));
  const input = "w-full rounded-xl border border-slate-200 p-2 text-sm font-mono tracking-widest focus:outline-emerald-600";

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">
            {role === "buyer" ? "Purchase" : role === "seller" ? "Sale" : "Promoted sale"}
          </p>
          <h3 className="mt-1 font-mono text-sm font-bold text-slate-800">#{order.orderNumber}</h3>
        </div>
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">
          {String(status || "").replace(/_/g, " ")}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{amountLabel}</p>
          <p className="mt-1 text-sm font-black text-slate-900">{money(amount)}</p>
        </div>
        <div>
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Date</p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {order.createdAt ? new Date(order.createdAt).toLocaleDateString("en-KE") : "N/A"}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        {(order.items || []).map((it, i) => (
          <li key={`${it.productId}-${i}`} className="flex justify-between gap-3">
            <span>{it.name} × {it.quantity}</span>
            <span className="font-semibold">{money(it.pricePaid * it.quantity)}</span>
          </li>
        ))}
      </ul>

      {/* BUYER: reveal the PIN and QR only when needed */}
      {role === "buyer" && open && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          {!pinData ? (
            <button type="button" onClick={showPin} disabled={busy}
              className="w-full rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              Show my delivery PIN
            </button>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Your delivery PIN</p>
              <p className="my-2 font-mono text-3xl font-black tracking-[0.3em] text-emerald-900">{pinData.pin}</p>
              <div className="mx-auto my-3 w-fit rounded-lg bg-white p-2">
                <QRCodeSVG value={pinData.qrPayload} size={150} level="M" />
              </div>
              <p className="text-[11px] leading-5 text-emerald-800">
                Show this to the seller <b>only after you receive your item</b>. Scanning it or typing the PIN releases your payment.
              </p>
              <button type="button" onClick={() => setPinData(null)} className="mt-2 text-[11px] font-bold text-emerald-700 underline">Hide</button>
            </div>
          )}
        </div>
      )}

      {/* SELLER: delivery address and PIN entry */}
      {role === "seller" && open && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {ship && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-bold text-slate-800">Deliver to {ship.fullName}</p>
              <p>{ship.phoneNumber} · {ship.subCounty}, {ship.county}</p>
              {ship.deliveryNotes && <p className="mt-1 italic">{ship.deliveryNotes}</p>}
            </div>
          )}
          <form onSubmit={verify} className="flex gap-2">
            <input inputMode="numeric" maxLength={6} placeholder="Buyer's 6-digit PIN" value={sellerPin}
              onChange={(e) => setSellerPin(e.target.value.replace(/\D/g, ""))} className={input} />
            <button type="submit" disabled={busy}
              className="shrink-0 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
              Confirm delivery
            </button>
          </form>
          <p className="text-[11px] text-slate-400">Only enter the PIN after the buyer has your item in hand.</p>
        </div>
      )}

      {canCancel && (
        <button type="button" onClick={cancel} disabled={busy} className="mt-3 text-[11px] font-bold text-red-600 underline disabled:opacity-50">
          Cancel order
        </button>
      )}
      {msg && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{msg}</p>}
    </article>
  );
}

/* ───────────── Product card ───────────── */
function ProductCard({ product, to, badge }) {
  const navigate = useNavigate();
  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
      <button type="button" onClick={() => navigate(to)} className="block w-full text-left">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name || "Product"} loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs font-bold text-slate-400">No image</div>
          )}
          {badge && <span className="absolute left-2 top-2 rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold uppercase text-amber-700">{badge}</span>}
        </div>
        <div className="p-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-emerald-600">{product.category || "general"}</p>
          <h3 className="mt-1 line-clamp-2 text-sm font-black text-slate-900">{product.name}</h3>
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-lg font-black text-slate-900">{money(product.price)}</span>
            {product.quantity !== undefined && <span className="text-[10px] font-semibold text-slate-400">{product.quantity} left</span>}
          </div>
        </div>
      </button>
    </article>
  );
}

/* ───────────── Page ───────────── */
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
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState(null);
  const [notice, setNotice] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);

  // ── Load the profile ──
  useEffect(() => {
    if (auth.loading) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        if (isOwnProfile) {
          if (!auth.authenticated) { navigate(ROUTES.HOME, { replace: true }); return; }
          setBrand(myProfile);
          if (isMarketer) {
            const [prods, metrics] = await Promise.all([
              apiClient.get("/products", { params: { sellerId: myId, status: "all", limit: 50 } }),
              apiClient.get("/network/matrix-metrics").catch(() => null),
            ]);
            if (cancelled) return;
            setProducts(prods.data.feed || []);
            setMatrix(metrics?.data?.ok ? metrics.data : null);
          }
        } else {
          const { data } = await apiClient.get(`/profiles/${encodeURIComponent(usernameParam)}`);
          if (cancelled) return;
          setBrand(data.profile);
          setProducts(data.products || []);
          setFeatured(data.featured || []);
        }
      } catch (e) {
        if (!cancelled) {
          if (e.response?.status === 404) setNotFound(true);
          else console.error("Profile load failed:", e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.loading, auth.authenticated, isOwnProfile, usernameParam, myId, isMarketer]);

  const fetchOrders = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/orders", { params: { limit: 30 } });
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) { console.error("Orders load failed:", e); setOrders([]); }
  }, []);

  const fetchShared = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/products/shared", { params: isOwnProfile ? {} : { username: usernameParam } });
      setShared(data.products || []);
    } catch (e) { console.error("Shared load failed:", e); setShared([]); }
  }, [isOwnProfile, usernameParam]);

  const tabs = [
    ...(showShop ? [{ id: "products", label: "Products" }, { id: "shared", label: "Shared Store" }] : []),
    ...(isOwnProfile ? [{ id: "orders", label: "Orders" }] : []),
    { id: "about", label: "About" },
  ];
  const tab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0].id;

  useEffect(() => { if (tab === "orders" && isOwnProfile) fetchOrders(); }, [tab, isOwnProfile, fetchOrders]);
  useEffect(() => { if (tab === "shared" && showShop) fetchShared(); }, [tab, showShop, fetchShared]);

  // ── Avatar ──
  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) return setNotice("Please choose a JPG, PNG or WebP image.");
    if (file.size > 2 * 1024 * 1024) return setNotice("Profile pictures can be up to 2 MB.");
    setUpdatingAvatar(true);
    setNotice("");
    try {
      const url = await uploadImageToCloudinary(file, "profiles", () => auth.currentUser.getIdToken());
      await patchProfile({ profilePhoto: url }); // the server only accepts images from our Cloudinary folder
      setBrand((b) => ({ ...(b || {}), profilePhoto: url }));
      setAvatarOpen(false);
      refreshProfile();
      window.dispatchEvent(new CustomEvent("profile-avatar-updated", { detail: { profilePhoto: url } }));
    } catch (err) {
      console.error("Avatar update failed:", err);
      setNotice(err.message === "UPLOAD_FAILED" ? "Image upload failed. Check your connection." : err.code ? friendlyError(err) : err.message || "Couldn't update your picture.");
    } finally { setUpdatingAvatar(false); }
  };

  const copy = async (text, okMsg) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(okMsg);
      setTimeout(() => setNotice(""), 2500);
    } catch { setNotice("Couldn't copy. Please copy it manually."); }
  };

  if (loading || auth.loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Loading profile</p>
      </div>
    );
  }
  if (notFound || !brand) {
    return (
      <div className="px-4 py-24 text-center">
        <p className="text-sm font-bold text-slate-700">This shop isn't available.</p>
        <Link to={ROUTES.MARKETPLACE} className="mt-3 inline-block text-xs font-bold text-emerald-700 underline">Back to the marketplace</Link>
      </div>
    );
  }

  const displayName = brand.displayName || [brand.firstName, brand.lastName].filter(Boolean).join(" ") || "Sokodigi Member";
  const profileImage = brand.profilePhoto || "";
  const planNum = Number(String(me.plan || "").replace("phase", "")) || 0;
  const levelLabel = isOwnProfile ? (planNum ? `Phase ${planNum}` : "Member") : cap(brand.marketerLevel || "member");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shopUrl = brand.username ? `${origin}${profilePath(brand.username)}` : "";
  const pendingMarketer = isOwnProfile && me.accountCategory === "network" && !isMarketer;

  return (
    <main className="min-h-screen bg-slate-50/60">
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarFile} className="hidden" />
      <AvatarMenuModal
        isOpen={avatarOpen}
        onClose={() => setAvatarOpen(false)}
        currentImageUrl={profileImage}
        isOwnProfile={isOwnProfile}
        onUploadClick={() => fileInputRef.current?.click()}
      />

      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:py-10">
        {pendingMarketer && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <span>Your marketer shop isn't live yet. Activate your membership to start selling.</span>
            <Link to={ROUTES.MEMBERSHIP} className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 font-bold text-white">Activate</Link>
          </div>
        )}

        {/* HEADER */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="h-32 bg-gradient-to-r from-emerald-950 via-emerald-800 to-emerald-600 sm:h-40" />
          <div className="relative px-5 pb-6 sm:px-8">
            <div className="-mt-14 flex flex-col gap-5 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
                <button
                  type="button"
                  onClick={() => isOwnProfile && setAvatarOpen(true)}
                  className={`relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-emerald-500 bg-white shadow-lg sm:h-32 sm:w-32 ${isOwnProfile ? "cursor-pointer" : "cursor-default"}`}
                  title={isOwnProfile ? "Manage profile picture" : displayName}
                >
                  {profileImage ? (
                    <img src={profileImage} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-4xl font-black text-emerald-700">{displayName.charAt(0).toUpperCase()}</span>
                  )}
                  {updatingAvatar && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="h-7 w-7 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    </div>
                  )}
                </button>

                <div className="pb-1 text-center sm:text-left">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">{displayName}</h1>
                  {brand.username && <p className="mt-1 text-sm font-medium text-slate-500">@{brand.username}</p>}
                  {brand.brandName && <p className="mt-1 text-sm font-semibold text-slate-700">{brand.brandName}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    {showShop && (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">{levelLabel}</span>
                    )}
                    {isOwnProfile && brand.membershipNumber && (
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] font-bold text-slate-500">#{brand.membershipNumber}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                {shopUrl && (
                  <button type="button" onClick={() => copy(shopUrl, "Shop link copied")}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:text-emerald-700">
                    Share shop
                  </button>
                )}
                {isOwnProfile && isMarketer && brand.username && (
                  <button type="button" onClick={() => copy(`${origin}${registerPath(brand.username)}`, "Invite link copied")}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">
                    Copy invite link
                  </button>
                )}
              </div>
            </div>

            {brand.bio && <p className="mt-6 max-w-3xl text-sm leading-6 text-slate-600">{brand.bio}</p>}

            {showShop && (
              <div className="mt-6 grid grid-cols-3 divide-x overflow-hidden rounded-2xl border border-slate-100 bg-slate-50">
                <Stat value={products.length} label="Products" />
                <Stat value={isOwnProfile ? matrix?.summary?.totalDownline ?? 0 : brand.location?.county || "—"} label={isOwnProfile ? "Network" : "Location"} />
                <Stat value={levelLabel} label="Level" accent />
              </div>
            )}
          </div>
        </section>

        {notice && <div role="status" className="mt-3 text-center text-xs font-bold text-emerald-700">{notice}</div>}

        {/* NETWORK (own, active marketers) */}
        {isOwnProfile && matrix?.ok && (
          <>
            <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ["Total network", matrix.summary?.totalDownline || 0, ""],
                ["Active members", matrix.summary?.activeDownline || 0, "text-emerald-600"],
                ["Spillover rate", `${matrix.spilloverMetrics?.spilloverRatePercentage || 0}%`, ""],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className={`mt-2 text-2xl font-black ${cls || "text-slate-900"}`}>{value}</p>
                </div>
              ))}
            </section>
            <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-1"><MatrixTreeChart generations={matrix.generations} /></div>
              <div className="lg:col-span-2"><LegDistributionCards legBalanceMatrix={matrix.legBalanceMatrix} spilloverMetrics={matrix.spilloverMetrics} /></div>
            </section>
          </>
        )}

        {/* FEATURED (public shops) */}
        {!isOwnProfile && featured.length > 0 && (
          <section className="mt-6">
            <h2 className="mb-3 text-sm font-black text-slate-900">Featured</h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((p) => <ProductCard key={p._id} product={p} to={productPath(p._id)} badge="Featured" />)}
            </div>
          </section>
        )}

        {/* TABS */}
        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto border-b border-slate-100">
            <div className="flex min-w-max">
              {tabs.map((t) => (
                <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
                  className={`border-b-2 px-5 py-4 text-xs font-black transition ${tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-700"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "products" && (
            <section className="p-5 sm:p-7">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900">Storefront</h2>
                  <p className="mt-1 text-xs text-slate-400">{isOwnProfile ? "Everything you've listed, including hidden items." : "Products from this shop."}</p>
                </div>
                {isOwnProfile && (
                  <button type="button" onClick={() => navigate(ROUTES.MEMBER_DASHBOARD)} className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800">Manage store</button>
                )}
              </div>
              {products.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-xs text-slate-400">No products yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((p) => (
                    <ProductCard key={p._id} product={p} to={productPath(p._id)}
                      badge={isOwnProfile && (p.status === "UNLISTED" || p.isShelved === false) ? "Hidden" : undefined} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "shared" && (
            <section className="p-5 sm:p-7">
              <h2 className="text-lg font-black text-slate-900">Shared Store</h2>
              <p className="mb-5 mt-1 text-xs text-slate-400">
                {isOwnProfile ? "Products you promote. You earn a 5% bonus when they sell through your link." : "Products this shop recommends from other sellers."}
              </p>
              {shared.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-14 text-center text-xs text-slate-400">
                  {isOwnProfile ? "Open any product and tap “Copy my share link” to start promoting it." : "Nothing shared yet."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {shared.map((p) => (
                    <ProductCard key={p._id} product={p} badge="Promoted"
                      to={`${productPath(p._id)}?ref=${encodeURIComponent(p.shareCode)}`} />
                  ))}
                </div>
              )}
            </section>
          )}

          {tab === "orders" && isOwnProfile && (
            <section className="p-5 sm:p-7">
              <h2 className="text-lg font-black text-slate-900">My Orders</h2>
              <p className="mt-1 text-xs text-slate-400">Your purchases, and your sales if you run a shop.</p>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                {orders.length > 0 ? (
                  orders.map((o) => <OrderCard key={o._id} order={o} myId={myId} onChanged={fetchOrders} />)
                ) : (
                  <p className="col-span-full rounded-2xl border border-slate-100 py-12 text-center text-xs text-slate-400">No orders yet.</p>
                )}
              </div>
            </section>
          )}

          {tab === "about" && (
            <section className="p-5 sm:p-7">
              <div className="grid gap-6 rounded-2xl border border-slate-200 p-5 sm:grid-cols-2">
                {[
                  ["Username", brand.username ? `@${brand.username}` : "—"],
                  ["Brand", brand.brandName || "—"],
                  ["County", brand.location?.county || "—"],
                  ...(isOwnProfile ? [["Membership number", brand.membershipNumber || "Not yet issued"], ["Phone", brand.phoneNumber || "—"]] : []),
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>

        {isOwnProfile && isMarketer && (
          <div className="mt-6 flex justify-center">
            <button type="button" onClick={() => navigate(ROUTES.MY_TEAM)}
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-xs font-black text-emerald-700 hover:bg-emerald-100">
              Open my team
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
