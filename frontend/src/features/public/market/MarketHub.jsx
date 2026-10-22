import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";

import apiClient from "../../../services/apiClient";
import ProductCard from "./ProductCard";
import HeroSlider from "./HeroSlider";

const PAGE_SIZE = 20;

const COLLECTIONS = [
  { id: "all", icon: "▦", label: "All Items" },
  { id: "best-sellers", icon: "🔥", label: "Best Sellers" },
  { id: "top-products", icon: "✦", label: "Top Brands" },
  { id: "fresh-drops", icon: "✧", label: "Fresh Drops" },
];

const CATEGORIES = [
  ["", "All categories"],
  ["phones-gadgets", "Phones & Gadgets"],
  ["tech-computing", "Tech & Computing"],
  ["apparel-fashion", "Apparel & Fashion"],
  ["home-appliances", "Home Appliances"],
  ["beauty-personal-care", "Beauty & Care"],
  ["ankara-art", "Ankara & Art"],
  ["general", "General"],
];

const SORTS = [
  ["relevance", "Recommended"],
  ["newest", "Newest"],
  ["price-asc", "Price: low to high"],
  ["price-desc", "Price: high to low"],
];

const TITLES = { all: "Marketplace", "best-sellers": "Best Sellers", "top-products": "Top Brands", "fresh-drops": "Fresh Drops" };

const idOf = (p) => p?._id || p?.id;

export default function MarketHub() {
  const navigate = useNavigate();
  const { searchResults, isSearching = false, activeQuery = "", onSearchUpdate } = useOutletContext() || {};

  const [banner, setBanner] = useState([]);
  const [products, setProducts] = useState([]);
  const [collection, setCollection] = useState("all");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("relevance");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  // Featured products for the hero
  useEffect(() => {
    let cancelled = false;
    apiClient.get("/products/hero-banner")
      .then(({ data }) => !cancelled && setBanner(Array.isArray(data?.banner) ? data.banner : []))
      .catch(() => !cancelled && setBanner([]));
    return () => { cancelled = true; };
  }, []);

  // First page whenever the collection changes (or the retry button is pressed)
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setPage(1);

    const request = collection === "all"
      ? apiClient.get("/products", { params: { limit: PAGE_SIZE, page: 1 } })
      : apiClient.get("/products/discovery", { params: { type: collection, limit: 50 } });

    request
      .then(({ data }) => {
        if (cancelled) return;
        const list = data?.feed ?? data?.products ?? data;
        const rows = Array.isArray(list) ? list : [];
        setProducts(rows);
        setHasMore(collection === "all" && rows.length === PAGE_SIZE);
      })
      .catch((e) => {
        if (cancelled) return;
        console.error("Marketplace feed failed:", e);
        setProducts([]);
        setHasMore(false);
        setError("We couldn't connect to the marketplace. Please try again.");
      })
      .finally(() => !cancelled && setLoading(false));

    return () => { cancelled = true; };
  }, [collection, reloadKey]);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = page + 1;
      const { data } = await apiClient.get("/products", { params: { limit: PAGE_SIZE, page: next } });
      const rows = Array.isArray(data?.feed) ? data.feed : [];
      setProducts((prev) => {
        const seen = new Set(prev.map(idOf));
        return [...prev, ...rows.filter((r) => !seen.has(idOf(r)))];
      });
      setPage(next);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (e) {
      console.error("Load more failed:", e);
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const query = String(activeQuery || "").trim().toLowerCase();
  const hasSearch = query.length > 0;

  const shown = useMemo(() => {
    let rows = hasSearch && Array.isArray(searchResults) && searchResults.length ? searchResults : products;
    if (hasSearch && !(Array.isArray(searchResults) && searchResults.length)) {
      rows = rows.filter((p) =>
        [p?.name, p?.brandName, p?.category, p?.description].some((v) => String(v || "").toLowerCase().includes(query))
      );
    }
    if (category) rows = rows.filter((p) => p?.category === category);
    if (sort === "newest") rows = [...rows].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    if (sort === "price-asc") rows = [...rows].sort((a, b) => Number(a.price) - Number(b.price));
    if (sort === "price-desc") rows = [...rows].sort((a, b) => Number(b.price) - Number(a.price));
    return rows;
  }, [products, searchResults, hasSearch, query, category, sort]);

  const busy = loading || isSearching;
  const empty = shown.length === 0;
  const title = hasSearch ? "Search results" : TITLES[collection] || "Marketplace";
  const clearSearch = () => onSearchUpdate?.({ q: "", type: "" });

  const chip = (active) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-4 text-xs font-bold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
      active ? "border-emerald-800 bg-emerald-800 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-800"
    }`;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-3 pb-10 sm:px-5 lg:px-7">
      <HeroSlider products={banner} />

      {/* Collections */}
      <section aria-label="Browse collections">
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0" role="group" aria-label="Collections">
          {COLLECTIONS.map((c) => (
            <button key={c.id} type="button" onClick={() => setCollection(c.id)} aria-pressed={!hasSearch && collection === c.id} className={chip(!hasSearch && collection === c.id)}>
              <span aria-hidden="true">{c.icon}</span>{c.label}
            </button>
          ))}
        </div>
      </section>

      {/* Catalogue */}
      <section className="space-y-4" aria-labelledby="market-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-emerald-950/10 pb-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full bg-emerald-700" />
            <div>
              <h2 id="market-heading" className="text-xl font-black tracking-tight text-emerald-950 sm:text-2xl">{title}</h2>
              <p className="text-xs text-slate-500 sm:text-sm">
                {hasSearch ? <>Results for “{activeQuery.trim()}” <button type="button" onClick={clearSearch} className="ml-1 font-bold text-emerald-700 underline">Clear</button></> : "Products from verified Sokodigi sellers."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!busy && !error && !empty && <span className="hidden rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 sm:inline">{shown.length} {shown.length === 1 ? "product" : "products"}</span>}
            <label className="sr-only" htmlFor="sort">Sort products</label>
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)} className="min-h-10 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 focus:border-emerald-500 focus:outline-none">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        {/* Category chips */}
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="group" aria-label="Categories">
          {CATEGORIES.map(([slug, label]) => (
            <button key={slug || "all"} type="button" onClick={() => setCategory(slug)} aria-pressed={category === slug}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${category === slug ? "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Loading */}
        {busy && (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4" role="status" aria-label="Loading products">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                <div className="aspect-[4/3] animate-pulse rounded-xl bg-slate-100" />
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-slate-100" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
                <div className="mt-4 h-10 animate-pulse rounded-xl bg-emerald-50" />
              </div>
            ))}
            <span className="sr-only">Loading products…</span>
          </div>
        )}

        {/* Error */}
        {!busy && error && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
            <h3 className="text-base font-extrabold text-slate-800">Marketplace temporarily unavailable</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{error}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="mt-5 rounded-full bg-emerald-800 px-5 py-3 text-xs font-extrabold text-white hover:bg-emerald-900">Try again</button>
          </div>
        )}

        {/* Empty */}
        {!busy && !error && empty && (
          <div className="rounded-2xl border border-slate-100 bg-white px-6 py-14 text-center shadow-sm">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl" aria-hidden="true">🛍️</span>
            <h3 className="mt-5 text-base font-extrabold text-slate-800">{hasSearch || category ? "No matching products found" : "Your marketplace is waiting"}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              {hasSearch || category ? "Try another name, brand or category." : "There's nothing in this collection right now. Please check back soon."}
            </p>
            {(hasSearch || category) && (
              <button type="button" onClick={() => { clearSearch(); setCategory(""); }} className="mt-5 rounded-full border border-emerald-800/15 px-5 py-2.5 text-xs font-bold text-emerald-900 hover:bg-emerald-50">Show all products</button>
            )}
          </div>
        )}

        {/* Grid */}
        {!busy && !error && !empty && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((p, i) => <ProductCard key={idOf(p) || `p-${i}`} product={p} />)}
            </div>

            {hasMore && !hasSearch && !category && (
              <div className="pt-2 text-center">
                <button type="button" onClick={loadMore} disabled={loadingMore} className="rounded-full border border-emerald-800/20 bg-white px-8 py-3 text-xs font-extrabold text-emerald-900 hover:bg-emerald-50 disabled:opacity-50">
                  {loadingMore ? "Loading…" : "Show more products"}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {!busy && !error && !empty && (
        <div className="flex flex-col items-center gap-1 border-t border-slate-100 py-6 text-center">
          <span className="text-sm font-extrabold text-emerald-900">Shop. Support. Grow.</span>
          <p className="text-xs text-slate-500">Every payment is protected by Sokodigi escrow.</p>
        </div>
      )}
    </main>
  );
}
