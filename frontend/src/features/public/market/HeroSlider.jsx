import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { productPath } from "../../../constants/routes";

const AUTOPLAY_MS = 6000;
const formatKsh = (v) => `KSh ${Number(v || 0).toLocaleString("en-KE")}`;

function sized(url, w = 800) {
  if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !url.includes("/image/upload/")) return url || "";
  if (/\/image\/upload\/[^/]*(w_|f_|q_)/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${w}/`);
}

const Chevron = ({ dir }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
  </svg>
);

const TRUST = [
  ["🔒", "Escrow protected"],
  ["📲", "Pay with M-Pesa"],
  ["🔑", "Confirm on delivery"],
];

export default function HeroSlider({ products = [] }) {
  const items = useMemo(() => (Array.isArray(products) ? products.slice(0, 5) : []), [products]);
  const [index, setIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const touchX = useRef(null);

  const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => setIndex(0), [products]);
  useEffect(() => setImageFailed(false), [index]);

  useEffect(() => {
    if (items.length <= 1 || paused || reduceMotion) return undefined;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), AUTOPLAY_MS);
    return () => clearInterval(t);
  }, [items.length, paused, reduceMotion]);

  const go = (delta) => setIndex((i) => (i + delta + items.length) % items.length);
  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null || items.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  };

  const p = items[index];
  const id = p?._id || p?.id;
  const image = sized(p?.imageUrl);

  return (
    <section aria-label="Featured products" className="relative isolate overflow-hidden rounded-3xl bg-white shadow-[0_12px_38px_rgba(16,49,34,0.09)] ring-1 ring-emerald-950/5"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="grid grid-cols-1 md:grid-cols-12">
        {/* Product image: first on phones, right on desktop */}
        <div className="relative order-1 flex flex-col items-center justify-center bg-gradient-to-br from-[#f6faf6] via-white to-[#e7f2e9] px-4 py-5 sm:px-8 md:order-2 md:col-span-5 md:py-8">
          <div className="mb-3 flex w-full max-w-md items-center justify-between">
            <span className="rounded-full border border-emerald-900/10 bg-white px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-emerald-900 shadow-sm">
              {p ? "Featured pick" : "Welcome"}
            </span>
            {items.length > 1 && <span className="text-[11px] font-bold tabular-nums text-slate-500">{String(index + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>}
          </div>

          <div className="relative flex h-48 w-full max-w-md items-center justify-center overflow-hidden rounded-2xl border border-white bg-white/90 p-3 shadow-[0_18px_45px_rgba(18,55,35,0.10)] sm:h-60 md:h-72">
            {p && image && !imageFailed ? (
              <img key={`${id}-${image}`} src={image} alt={p.name || "Featured product"} loading="eager" onError={() => setImageFailed(true)}
                className="h-full w-full object-contain transition-transform duration-500 hover:scale-105" />
            ) : (
              <div className="px-4 text-center">
                <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl" aria-hidden="true">🛍️</span>
                <p className="mt-3 text-base font-extrabold text-emerald-900">Your next great find</p>
                <p className="mt-1 text-xs text-slate-500">Explore products from Kenyan sellers.</p>
              </div>
            )}
          </div>

          {items.length > 1 && (
            <div className="mt-4 flex w-full max-w-md items-center justify-between">
              <div className="flex items-center gap-2" role="group" aria-label="Choose featured product">
                {items.map((item, i) => (
                  <button key={item._id || item.id || i} type="button" onClick={() => setIndex(i)} aria-label={`Show product ${i + 1}`} aria-current={index === i ? "true" : undefined}
                    className={`h-2 rounded-full transition-all duration-300 ${index === i ? "w-8 bg-emerald-700" : "w-2 bg-emerald-900/20 hover:bg-emerald-900/40"}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => go(-1)} aria-label="Previous product" className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 bg-white text-emerald-900 hover:bg-emerald-50"><Chevron dir="left" /></button>
                <button type="button" onClick={() => go(1)} aria-label="Next product" className="flex h-9 w-9 items-center justify-center rounded-full border border-emerald-900/10 bg-white text-emerald-900 hover:bg-emerald-50"><Chevron dir="right" /></button>
              </div>
            </div>
          )}
        </div>

        {/* Message */}
        <div className="relative order-2 flex flex-col justify-center overflow-hidden bg-gradient-to-br from-[#075b43] via-[#034c39] to-[#062f2b] px-5 py-7 text-white sm:px-9 md:order-1 md:col-span-7 md:px-10 md:py-10 lg:px-12">
          <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-28 h-64 w-64 rounded-full border border-white/[0.07]" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 left-1/3 h-72 w-72 rounded-full bg-emerald-400/[0.09] blur-3xl" />

          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.13em] text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Sokodigi MarketHub
            </span>

            {p ? (
              <>
                <h1 key={id || index} className="mt-4 line-clamp-2 max-w-2xl text-2xl font-black leading-[1.1] tracking-tight sm:text-4xl lg:text-[44px]">{p.name}</h1>
                {p.brandName && <p className="mt-2 text-xs font-semibold text-emerald-200/90">by {p.brandName}</p>}
                <p className="mt-3 line-clamp-2 max-w-xl text-sm leading-6 text-emerald-50/80 sm:line-clamp-3 sm:text-[15px]">
                  {p.description || "Discover products and businesses from the Sokodigi community."}
                </p>
                <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-200/75">Price</p>
                    <p className="mt-0.5 text-2xl font-black tracking-tight">{formatKsh(p.price)}</p>
                  </div>
                  {Number(p.affiliateCommission) > 0 && (
                    <div className="border-l border-white/20 pl-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-200/75">Promoter bonus</p>
                      <p className="mt-0.5 text-xl font-extrabold text-emerald-300">{formatKsh(p.affiliateCommission)}</p>
                    </div>
                  )}
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link to={productPath(id)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-xs font-extrabold text-emerald-900 shadow-lg shadow-black/10 transition hover:-translate-y-0.5 hover:bg-emerald-50">
                    View product →
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h1 className="mt-4 max-w-2xl text-3xl font-black leading-[1.1] tracking-tight sm:text-5xl">
                  Discover products from <span className="text-emerald-300">trusted Kenyan sellers.</span>
                </h1>
                <p className="mt-3 max-w-lg text-sm leading-6 text-emerald-50/80 sm:text-[15px]">
                  Browse listings, chat with sellers and pay safely through escrow.
                </p>
              </>
            )}

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-4 text-[11px] font-semibold text-emerald-100/85">
              {TRUST.map(([icon, label]) => <li key={label} className="flex items-center gap-1.5"><span aria-hidden="true">{icon}</span>{label}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
