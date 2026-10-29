import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";
import apiClient from "../../services/apiClient";
import ROUTES, { productPath, profilePath } from "../../constants/routes";
import { sizedImage } from "../../utils/image";
import { uploadImageToCloudinary } from "../../utils/cloudinaryUploader";
import AddProductModal from "./AddProductModal";
import OnboardingChecklist from "../onboarding/OnboardingChecklist";
import PushAsk from "../../pwa/PushAsk";
import OrderDispute from "../orders/OrderDispute";
import InventoryPanel from "./InventoryPanel";
import { MovementsSheet } from "./InventoryPanel";
import PosTab from "./pos/PosTab";
import ReportsTab from "./pos/ReportsTab";

const LOW = 10;
const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const idOf = (v) => String(v?._id ?? v ?? "");
const when = (d) =>
  d
    ? new Date(d).toLocaleString("en-KE", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
const isPublic = (p) => p.isShelved !== false && ["LISTED", "ACTIVE"].includes(p.status);

const CATEGORIES = [
  ["phones-gadgets", "Phones & Gadgets"],
  ["tech-computing", "Tech & Computing"],
  ["apparel-fashion", "Apparel & Fashion"],
  ["home-appliances", "Home Appliances"],
  ["beauty-personal-care", "Beauty & Care"],
  ["ankara-art", "Ankara & Art"],
  ["general", "General"],
];

const ERR = {
  PRODUCT_HAS_OPEN_ORDERS: "This product has open orders. Unlist it instead, or finish those orders first.",
  INSUFFICIENT_STOCK: "Not enough stock for that.",
  STOCK_CHANGE_NOT_POSSIBLE: "That change would take stock below zero.",
  INVALID_QUANTITY: "Enter a whole number of at least 1.",
  INVALID_PRODUCT_PRICE: "Price must be a whole number of at least KES 50.",
  INVALID_STOCK_CHANGE: "Enter a whole number, like 5 or -2.",
  ORDER_NOT_CONFIRMABLE: "This order can't be confirmed any more.",
  ORDER_NOT_FOUND: "Order not found.",
  ORDER_NOT_CANCELLABLE: "This order can't be cancelled any more.",
  INVALID_RELEASE_PIN: "That PIN is incorrect.",
  TOO_MANY_ATTEMPTS: "Too many wrong attempts. Try again in 15 minutes.",
  ALREADY_FULFILLED: "This order was already completed.",
  INVALID_PIN_FORMAT: "Enter the 6-digit PIN.",
  MARKETER_ACCOUNT_REQUIRED: "Your membership isn't active. Renew it to manage your shop.",
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
  INVALID_CATEGORY: "Choose a valid category.",
  INVALID_IMAGE_URL: "That photo couldn't be verified. Try another.",
  NAME_REQUIRED: "Enter a product name.",
  PLAN_LIMIT_REACHED: "You've reached your plan's product limit. Upgrade to add more.",
  PLAN_UPGRADE_REQUIRED: "That feature needs a higher plan.",
};

const errMsg = (e) =>
  !e.response
    ? "Couldn't reach Sokodigi. Check your connection."
    : ERR[e.response.data?.error] || "Something went wrong. Please try again.";

const input =
  "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none disabled:bg-slate-50";
const lab = "mb-1 block text-[11px] font-bold uppercase text-slate-500";
const btn = "min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-50";

/* ───────── Plan Status Card ───────── */
function PlanStatusCard({ summary, onUpgrade }) {
  if (!summary) return null;

  const { total = 0, limit = 50, plan = "Solo Retailer", readOnly = false } = summary;
  const pct = Math.min(100, Math.round((total / Math.max(1, limit)) * 100));
  const nearLimit = pct >= 80;
  const atLimit = total >= limit;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
              {plan}
            </span>
            {readOnly && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-800">
                Expired
              </span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            {total} of {limit.toLocaleString()} products used
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={onUpgrade}
            className="min-h-9 rounded-xl bg-emerald-700 px-4 text-xs font-bold text-white hover:bg-emerald-800"
          >
            {atLimit ? "Upgrade to add more" : "View plans"}
          </button>
        )}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${
            atLimit ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-emerald-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {(nearLimit || atLimit) && !readOnly && (
        <p className="mt-2 text-[11px] font-semibold text-amber-800">
          {atLimit ? "You’ve reached your product limit." : "You’re approaching your product limit."}{" "}
          <button type="button" onClick={onUpgrade} className="font-bold underline">
            Upgrade now
          </button>
        </p>
      )}

      {readOnly && (
        <p className="mt-2 text-[11px] font-semibold text-amber-800">
          Your membership has expired. Inventory is read-only.{" "}
          <Link to={ROUTES.MEMBERSHIP} className="font-bold underline">
            Renew to continue selling
          </Link>
        </p>
      )}
    </div>
  );
}

/* ───────── Sheet ───────── */
function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Err = ({ text }) =>
  text ? (
    <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
      {text}
    </p>
  ) : null;

/* ───────── Edit product ───────── */
function EditDialog({ product, getToken, onClose, onSaved, onDeleted }) {
  const [f, setF] = useState({
    name: product.name || "",
    category: CATEGORIES.some(([v]) => v === product.category) ? product.category : "general",
    price: String(product.price ?? ""),
    deliveryFee: String(product.deliveryFee ?? 0),
    description: product.description || "",
  });
  const [cost, setCost] = useState("");
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    apiClient
      .get("/inventory/costs")
      .then(({ data }) => {
        const c = data.costs?.[product._id];
        if (c != null) setCost(String(c));
      })
      .catch(() => {});
  }, [product._id]);

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const price = /^\d{1,8}$/.test(f.price.trim()) ? Number(f.price) : NaN;
  const fee =
    f.deliveryFee.trim() === ""
      ? 0
      : /^\d{1,6}$/.test(f.deliveryFee.trim())
      ? Number(f.deliveryFee)
      : NaN;
  const direct = Number.isInteger(price) ? price - Math.round(price * 0.01) : 0;
  const viaPromoter = Number.isInteger(price) ? direct - Math.round(price * 0.05) : 0;

  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError(ERR.NAME_REQUIRED);
    if (!Number.isInteger(price) || price < 50) return setError(ERR.INVALID_PRODUCT_PRICE);
    if (!Number.isInteger(fee)) return setError("Delivery fee must be a whole number.");
    if (cost.trim() !== "" && !/^\d{1,8}$/.test(cost.trim())) {
      return setError("Cost price must be a whole number.");
    }

    setBusy(true);
    setError("");
    try {
      const body = {
        name: f.name.trim(),
        category: f.category,
        price,
        deliveryFee: fee,
        description: f.description.trim(),
      };
      if (photo) body.imageUrl = await uploadImageToCloudinary(photo, "products", getToken);

      const { data } = await apiClient.put(`/products/${product._id}`, body);
      await apiClient.put(`/inventory/products/${product._id}/cost`, {
        costPrice: cost.trim() === "" ? null : Number(cost),
      });
      onSaved(data.product);
    } catch (x) {
      setError(
        x.message === "UPLOAD_FAILED"
          ? "Photo upload failed. Check your connection."
          : x.response
          ? errMsg(x)
          : x.message || errMsg(x)
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!armed) return setArmed(true);
    setBusy(true);
    setError("");
    try {
      await apiClient.delete(`/products/${product._id}`);
      onDeleted(product._id);
    } catch (x) {
      setError(errMsg(x));
      setArmed(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Edit product" onClose={busy ? () => {} : onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className={lab}>Name</label>
          <input className={input} maxLength={120} value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className={lab}>Category</label>
          <select className={input} value={f.category} onChange={set("category")}>
            {CATEGORIES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lab}>Price (KES)</label>
            <input className={input} inputMode="numeric" value={f.price} onChange={set("price")} />
          </div>
          <div>
            <label className={lab}>Delivery fee</label>
            <input
              className={input}
              inputMode="numeric"
              value={f.deliveryFee}
              onChange={set("deliveryFee")}
            />
          </div>
        </div>
        {Number.isInteger(price) && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
            You receive <b>{fmt(direct)}</b> per direct sale, or <b>{fmt(viaPromoter)}</b> when a
            promoter sells it (after the 1% Sokodigi fee and the 5% promoter bonus). Delivery fees
            are paid to you in full.
          </p>
        )}
        <div>
          <label className={lab}>Description</label>
          <textarea
            className={`${input} resize-none py-2`}
            rows={3}
            maxLength={2000}
            value={f.description}
            onChange={set("description")}
          />
        </div>
        <div>
          <label className={lab}>Cost price (what you pay)</label>
          <input
            className={input}
            inputMode="numeric"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Private. Used only for your profit report.
          </p>
        </div>
        <div>
          <label className={lab}>Change photo (optional)</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="block w-full text-xs text-slate-500"
          />
        </div>
        <Err text={error} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`${btn} flex-1 bg-slate-100 text-slate-700`}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className={`${btn} flex-1 bg-emerald-700 text-white`}
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
        <button
          type="button"
          onClick={remove}
          disabled={busy}
          className={`${btn} w-full ${armed ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}
        >
          {armed ? "Tap again to delete permanently" : "Delete this product"}
        </button>
        <p className="text-center text-[11px] text-slate-400">
          Don't want to delete it? Unlist it from the inventory instead.
        </p>
      </form>
    </Sheet>
  );
}

/* ───────── Adjust stock ───────── */
function StockDialog({ product, onClose, onDone }) {
  const [delta, setDelta] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const d = /^-?\d{1,6}$/.test(delta.trim()) ? Number(delta) : NaN;
  const next = Number.isInteger(d) ? Number(product.quantity || 0) + d : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!Number.isInteger(d) || d === 0) return setError(ERR.INVALID_STOCK_CHANGE);
    setBusy(true);
    setError("");
    try {
      const { data } = await apiClient.patch(`/products/${product._id}/stock`, { delta: d });
      onDone(data.product);
    } catch (x) {
      setError(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={`Stock: ${product.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          In stock now: <b>{Number(product.quantity || 0)}</b>
        </p>
        <div className="flex flex-wrap gap-2">
          {[5, 10, 20, -1].map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setDelta(String(q))}
              className={`${btn} border border-slate-200 text-slate-700 hover:bg-emerald-50`}
            >
              {q > 0 ? `+${q}` : q}
            </button>
          ))}
        </div>
        <div>
          <label className={lab}>Add or remove (use a minus to remove)</label>
          <input
            className={input}
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="e.g. 10 or -3"
          />
        </div>
        {next !== null && (
          <p className={`text-xs font-bold ${next < 0 ? "text-red-600" : "text-emerald-700"}`}>
            New stock: {next}
          </p>
        )}
        <Err text={error} />
        <button
          type="submit"
          disabled={busy || next === null || next < 0}
          className={`${btn} w-full bg-emerald-700 text-white`}
        >
          {busy ? "Saving…" : "Update stock"}
        </button>
      </form>
    </Sheet>
  );
}

/* ───────── Product Card ───────── */
export function ProductCard({ p, busy, onSale, onStock, onEdit, onToggle }) {
  const [showHistory, setShowHistory] = useState(false);
  const pub = isPublic(p);
  const q = Number(p.quantity || 0);
  const img = sizedImage(p.imageUrl, 200);

  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex gap-3 p-4">
        {img ? (
          <img
            src={img}
            alt=""
            loading="lazy"
            className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
            📦
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 break-words text-sm font-black text-slate-900">
              {p.name || "Unnamed product"}
            </h3>
            <span
              className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${
                pub ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {pub ? "On MarketHub" : "Unlisted"}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {String(p.category || "general").replace(/-/g, " ")} · {p.productCode || "No SKU"}
          </p>
          <p className="mt-1 text-lg font-black text-slate-900">{fmt(p.price)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <p
          className={`text-sm font-black ${
            q <= 0 ? "text-red-600" : q <= LOW ? "text-amber-600" : "text-emerald-700"
          }`}
        >
          {q <= 0 ? "Out of stock" : q <= LOW ? `${q} left · low` : `${q} in stock`}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowHistory(true)}
            className="cursor-pointer text-xs font-bold text-slate-500 underline hover:text-slate-800"
          >
            History
          </button>
          <span className="text-xs text-slate-300">·</span>
          <button
            type="button"
            onClick={() => onStock(p)}
            className="cursor-pointer text-xs font-bold text-emerald-700 underline hover:text-emerald-900"
          >
            Adjust stock
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-slate-100 p-3">
        <button
          type="button"
          disabled={busy || q < 1}
          onClick={onSale}
          className={`${btn} bg-emerald-700 text-white`}
        >
          Record sale
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onEdit(p)}
          className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}
        >
          Edit
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(p)}
          className={`${btn} ${
            pub ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {busy ? "Saving…" : pub ? "Unlist" : "List"}
        </button>
      </div>

      {showHistory && <MovementsSheet product={p} onClose={() => setShowHistory(false)} />}
    </article>
  );
}

/* ───────── Order Card ───────── */
const STATUS = {
  PROCESSING: ["New order", "bg-amber-100 text-amber-800"],
  DISPATCHED: ["On the way", "bg-sky-100 text-sky-800"],
  DELIVERED: ["Completed", "bg-emerald-100 text-emerald-800"],
  CANCELLED: ["Cancelled", "bg-slate-200 text-slate-600"],
  DISPUTED: ["Disputed", "bg-rose-100 text-rose-800"],
};

function OrderCard({ o, busy, pin, setPin, onConfirm, onCancel, onVerify, loadOrders }) {
  const [label, tone] = STATUS[o.orderStatus] || [o.orderStatus, "bg-slate-100 text-slate-600"];
  const ship = o.shippingDetails;

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Order</p>
          <p className="font-mono text-sm font-bold text-slate-900">#{o.orderNumber}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${tone}`}>
          {label}
        </span>
      </div>

      <ul className="mt-3 space-y-1 text-xs text-slate-700">
        {(o.items || []).map((it, i) => (
          <li key={`${it.productId}-${i}`} className="flex justify-between gap-3">
            <span>
              {it.name} × {it.quantity}
            </span>
            <span className="font-semibold">{fmt(it.pricePaid * it.quantity)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
        <span className="text-slate-500">{when(o.createdAt)}</span>
        <span className="font-black text-emerald-800">
          You receive {fmt(o.financials?.totalWholesaleToShop)}
        </span>
      </div>

      {ship && o.orderStatus !== "CANCELLED" && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
          <p className="font-bold text-slate-800">Deliver to {ship.fullName}</p>
          <p>
            {ship.phoneNumber} · {ship.subCounty}, {ship.county}
          </p>
          {ship.deliveryNotes && <p className="mt-1 italic">{ship.deliveryNotes}</p>}
        </div>
      )}

      {o.orderStatus === "PROCESSING" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">
            The buyer has paid. The money is held in escrow. Confirm to release this order for
            delivery and tell the buyer it's on its way.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onConfirm(o)}
              className={`${btn} bg-emerald-700 text-white`}
            >
              {busy ? "Working…" : "Confirm order"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onCancel(o)}
              className={`${btn} bg-red-50 text-red-700`}
            >
              Decline & refund
            </button>
          </div>
        </div>
      )}

      {o.orderStatus === "DISPATCHED" && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">
            When the buyer has their item, enter the 6-digit PIN they give you. That releases your
            payment.
          </p>
          <div className="flex gap-2">
            <input
              inputMode="numeric"
              maxLength={6}
              placeholder="Buyer's PIN"
              value={pin || ""}
              onChange={(e) =>
                setPin(o.orderNumber, e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-center font-mono text-sm tracking-[0.3em] focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={busy || (pin || "").length !== 6}
              onClick={() => onVerify(o)}
              className={`${btn} shrink-0 bg-slate-900 text-white`}
            >
              Confirm delivery
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(o)}
            className="text-[11px] font-bold text-red-600 underline"
          >
            Cancel and refund the buyer
          </button>
        </div>
      )}

      <OrderDispute order={o} role="seller" onChanged={loadOrders} />

      {o.orderStatus === "DELIVERED" && (
        <p className="mt-3 text-xs font-bold text-emerald-700">
          ✓ Delivered. {fmt(o.financials?.totalWholesaleToShop)} was added to your wallet.
        </p>
      )}

      {["PROCESSING", "DISPATCHED"].includes(o.orderStatus) && (
        <Link
          to={`${ROUTES.MESSAGES}?targetUser=${idOf(o.buyerId)}`}
          className="mt-3 inline-block text-[11px] font-bold text-emerald-700 underline"
        >
          💬 Message the buyer
        </Link>
      )}
    </article>
  );
}

/* ───────── Main Page ───────── */
export default function MyShopDashboard() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const myId = auth.user?._id ? String(auth.user._id) : null;
  const username = auth.profile?.username;

  const [tab, setTab] = useState("inventory");
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [pins, setPins] = useState({});
  const [inventorySummary, setInventorySummary] = useState(null);

  const noticeTimer = useRef(null);
  const getToken = useCallback(() => auth.currentUser.getIdToken(), [auth.currentUser]);

  const flash = (text, type = "ok") => {
    setNotice({ text, type });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  };

  useEffect(() => () => clearTimeout(noticeTimer.current), []);

  const loadProducts = useCallback(
    async (p = 1) => {
      const { data } = await apiClient.get("/products", {
        params: { sellerId: myId, status: "all", limit: 50, page: p },
      });
      const rows = data.feed || [];
      setProducts((prev) =>
        p === 1 ? rows : [...prev, ...rows.filter((r) => !prev.some((x) => x._id === r._id))]
      );
      setHasMore(rows.length === 50);
      setPage(p);
    },
    [myId]
  );

  const loadOrders = useCallback(async () => {
    const { data } = await apiClient.get("/orders", { params: { role: "seller", limit: 50 } });
    setOrders(Array.isArray(data) ? data : []);
  }, []);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/inventory/summary");
      setInventorySummary(data);
    } catch {
      // silent
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      await Promise.all([loadProducts(1), loadOrders(), loadSummary()]);
    } catch (e) {
      console.error("Dashboard load failed:", e);
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [loadProducts, loadOrders, loadSummary]);

  useEffect(() => {
    if (myId) loadAll();
  }, [myId, loadAll]);

  const swap = (p) =>
    setProducts((prev) => prev.map((x) => (x._id === p._id ? { ...x, ...p } : x)));

  const toggleListing = async (p) => {
    setBusyId(p._id);
    try {
      const { data } = await apiClient.patch(`/products/${p._id}/status`, {
        status: isPublic(p) ? "UNLISTED" : "LISTED",
      });
      swap(data.product);
      flash(
        isPublic(p)
          ? "Unlisted. It's hidden from the MarketHub and your shop page, but still in your inventory."
          : "Listed. Customers can see and order it now."
      );
    } catch (e) {
      flash(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const orderAction = async (o, run, okText) => {
    setBusyId(o._id);
    try {
      await run();
      await Promise.all([loadOrders(), loadProducts(1)]);
      flash(okText);
    } catch (e) {
      flash(errMsg(e), "error");
    } finally {
      setBusyId(null);
    }
  };

  const num = (o) => encodeURIComponent(o.orderNumber);
  const confirmOrder = (o) =>
    orderAction(
      o,
      () => apiClient.patch(`/orders/${num(o)}/confirm`),
      "Order confirmed. The buyer was told it's on its way."
    );
  const cancelOrder = (o) =>
    window.confirm("Cancel this order? The buyer is refunded in full.") &&
    orderAction(
      o,
      () => apiClient.patch(`/orders/${num(o)}/cancel`),
      "Order cancelled and the buyer refunded."
    );
  const verifyPin = (o) =>
    orderAction(
      o,
      async () => {
        await apiClient.patch(`/orders/${num(o)}/fulfill-handshake`, {
          pin: pins[o.orderNumber],
        });
        setPins((p) => ({ ...p, [o.orderNumber]: "" }));
      },
      "Delivery confirmed. Your payment was released to your wallet."
    );

  const handleUpgrade = () => navigate(ROUTES.MEMBERSHIP);

  const stats = useMemo(
    () => ({
      newOrders: orders.filter((o) => o.orderStatus === "PROCESSING").length,
      onTheWay: orders.filter((o) => o.orderStatus === "DISPATCHED").length,
      lowStock: products.filter((p) => Number(p.quantity || 0) <= LOW).length,
    }),
    [orders, products]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      const n = Number(p.quantity || 0);
      const okSearch =
        !q ||
        [p.name, p.productCode, p.category].some((v) =>
          String(v || "").toLowerCase().includes(q)
        );
      const okFilter =
        filter === "all" ||
        (filter === "listed" && isPublic(p)) ||
        (filter === "unlisted" && !isPublic(p)) ||
        (filter === "low" && n > 0 && n <= LOW) ||
        (filter === "out" && n <= 0);
      return okSearch && okFilter;
    });
  }, [products, search, filter]);

  const shownOrders = orders.filter(
    (o) => orderFilter === "all" || o.orderStatus === orderFilter
  );

  const tabs = [
    ["inventory", "📦", "Inventory", 0],
    ["orders", "📋", "Orders", stats.newOrders],
    ["pos", "🧮", "POS", 0],
    ["reports", "📊", "Reports", 0],
  ];

  const chip = (active) =>
    `shrink-0 rounded-full px-3.5 py-2 text-xs font-bold ${
      active ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
    }`;

  if (!myId) return null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10">
      <header
        className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(ROUTES.HOME)}
              className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              ← Home
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {auth.profile?.brandName || "My shop"}
              </p>
              <p className="hidden text-[11px] text-slate-500 sm:block">Inventory and orders</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {username && (
              <Link
                to={profilePath(username)}
                className="hidden rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 sm:block"
              >
                View my shop
              </Link>
            )}
            <button
              type="button"
              onClick={() => setDialog({ type: "add" })}
              className={`${btn} bg-emerald-700 text-white`}
            >
              + Add product
            </button>
          </div>
        </div>

        <nav className="mx-auto hidden max-w-6xl gap-1 px-6 md:flex" aria-label="Shop sections">
          {tabs.map(([k, icon, label, badge]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={`border-b-2 px-4 py-3 text-xs font-black ${
                tab === k
                  ? "border-emerald-700 text-emerald-800"
                  : "border-transparent text-slate-400 hover:text-slate-700"
              }`}
            >
              {icon} {label}
              {badge > 0 && (
                <span className="ml-1.5 rounded-full bg-rose-500 px-1.5 text-[10px] text-white">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-3 py-5 sm:px-6">
        {notice && (
          <p
            role={notice.type === "error" ? "alert" : "status"}
            className={`rounded-xl border px-4 py-3 text-xs font-bold ${
              notice.type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {notice.text}
          </p>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
          >
            {error}{" "}
            <button type="button" onClick={loadAll} className="ml-2 underline">
              Try again
            </button>
          </div>
        )}

        <OnboardingChecklist compact />
        <PlanStatusCard summary={inventorySummary} onUpgrade={handleUpgrade} />

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Overview">
          {[
            [
              "New orders",
              stats.newOrders,
              "text-amber-600",
              () => {
                setTab("orders");
                setOrderFilter("PROCESSING");
              },
            ],
            [
              "On the way",
              stats.onTheWay,
              "text-sky-700",
              () => {
                setTab("orders");
                setOrderFilter("DISPATCHED");
              },
            ],
            [
              "Low or out of stock",
              stats.lowStock,
              "text-red-600",
              () => {
                setTab("inventory");
                setFilter("low");
              },
            ],
            ["Counter sales", "Open POS", "text-emerald-700", () => setTab("pos")],
          ].map(([label, value, tone, go]) => (
            <button
              key={label}
              type="button"
              onClick={go}
              className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-300"
            >
              <p className="text-[11px] font-bold text-slate-500">{label}</p>
              <p className={`mt-2 truncate text-2xl font-black ${tone}`}>{value}</p>
            </button>
          ))}
        </section>

        <PushAsk reason="Get alerted the moment a customer places an order, so you can confirm it fast." />

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <>
            {tab === "inventory" && (
              <section className="space-y-4">
                <InventoryPanel refreshKey={products.length} />

                <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] leading-relaxed text-slate-600">
                  <b className="text-slate-800">Unlisted</b> products stay in your inventory but
                  are hidden from your shop page and the MarketHub, so customers can't order them.
                  You can still record sales and adjust their stock. Open orders carry on as normal.
                </p>

                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, SKU or category…"
                    aria-label="Search inventory"
                    className={input}
                  />
                  <div
                    className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                    role="group"
                    aria-label="Filter inventory"
                  >
                    {[
                      ["all", "All"],
                      ["listed", "On MarketHub"],
                      ["unlisted", "Unlisted"],
                      ["low", "Low stock"],
                      ["out", "Out of stock"],
                    ].map(([v, l]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFilter(v)}
                        aria-pressed={filter === v}
                        className={chip(filter === v)}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                {shown.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {shown.map((p) => (
                      <ProductCard
                        key={p._id}
                        p={p}
                        busy={busyId === p._id}
                        onSale={() => setTab("pos")}
                        onStock={(x) => setDialog({ type: "stock", product: x })}
                        onEdit={(x) => setDialog({ type: "edit", product: x })}
                        onToggle={toggleListing}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
                    <p className="text-4xl" aria-hidden="true">
                      📦
                    </p>
                    <h3 className="mt-3 font-black text-slate-900">
                      {products.length === 0 ? "Your inventory is empty" : "No matching products"}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {products.length === 0
                        ? "Add your first product to open your shop."
                        : "Try another search or filter."}
                    </p>
                    {products.length === 0 && (
                      <button
                        type="button"
                        onClick={() => setDialog({ type: "add" })}
                        className={`${btn} mt-4 bg-emerald-700 px-5 text-white`}
                      >
                        + Add your first product
                      </button>
                    )}
                  </div>
                )}

                {hasMore && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => loadProducts(page + 1)}
                      className={`${btn} border border-emerald-800/20 bg-white px-8 text-emerald-900`}
                    >
                      Show more products
                    </button>
                  </div>
                )}
              </section>
            )}

            {tab === "orders" && (
              <section className="space-y-4">
                <ol className="flex flex-wrap gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[11px] font-bold text-slate-500">
                  <li>1. Buyer pays (held in escrow)</li>
                  <li>2. You confirm the order</li>
                  <li>3. You deliver</li>
                  <li>4. Buyer gives you the PIN</li>
                  <li>5. You're paid</li>
                </ol>

                <div
                  className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
                  role="group"
                  aria-label="Filter orders"
                >
                  {[
                    ["all", "All"],
                    ["PROCESSING", "New"],
                    ["DISPATCHED", "On the way"],
                    ["DELIVERED", "Completed"],
                    ["CANCELLED", "Cancelled"],
                  ].map(([v, l]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setOrderFilter(v)}
                      aria-pressed={orderFilter === v}
                      className={chip(orderFilter === v)}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                {shownOrders.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {shownOrders.map((o) => (
                      <OrderCard
                        key={o._id}
                        o={o}
                        busy={busyId === o._id}
                        pin={pins[o.orderNumber]}
                        setPin={(n, v) => setPins((p) => ({ ...p, [n]: v }))}
                        onConfirm={confirmOrder}
                        onCancel={cancelOrder}
                        onVerify={verifyPin}
                        loadOrders={loadOrders}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center">
                    <p className="text-4xl" aria-hidden="true">
                      📋
                    </p>
                    <h3 className="mt-3 font-black text-slate-900">No orders here</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Orders from customers will appear when they buy from your shop.
                    </p>
                  </div>
                )}
              </section>
            )}

            {tab === "pos" && <PosTab />}
            {tab === "reports" && <ReportsTab />}
          </>
        )}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Shop sections"
      >
        {tabs.map(([k, icon, label, badge]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${
              tab === k ? "text-emerald-700" : "text-slate-500"
            }`}
          >
            <span className="relative text-lg" aria-hidden="true">
              {icon}
              {badge > 0 && (
                <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white">
                  {badge}
                </span>
              )}
            </span>
            {label}
          </button>
        ))}
      </nav>

      <AddProductModal
        isOpen={dialog?.type === "add"}
        onClose={() => setDialog(null)}
        onSuccess={(np) => {
          if (np) setProducts((prev) => [np, ...prev]);
          else loadProducts(1);
          setDialog(null);
          flash("Product added to your inventory.");
          loadSummary();
        }}
        uploadImageToCloudinary={uploadImageToCloudinary}
      />

      {dialog?.type === "edit" && (
        <EditDialog
          product={dialog.product}
          getToken={getToken}
          onClose={() => setDialog(null)}
          onSaved={(p) => {
            swap(p);
            setDialog(null);
            flash("Product updated.");
          }}
          onDeleted={(id) => {
            setProducts((prev) => prev.filter((x) => x._id !== id));
            setDialog(null);
            flash("Product deleted.");
            loadSummary();
          }}
        />
      )}

      {dialog?.type === "stock" && (
        <StockDialog
          product={dialog.product}
          onClose={() => setDialog(null)}
          onDone={(p) => {
            swap(p);
            setDialog(null);
            flash("Stock updated.");
          }}
        />
      )}
    </div>
  );
}
