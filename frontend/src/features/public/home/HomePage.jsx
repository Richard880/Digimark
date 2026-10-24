import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import heroBg from "../../../assets/hero-bg.jpeg";
import useAuth from "../../auth/hooks/useAuth";
import apiClient from "../../../services/apiClient";
import ROUTES, { productPath } from "../../../constants/routes";
import WelcomeSheet from "../../onboarding/WelcomeSheet";
import OnboardingChecklist from "../../onboarding/OnboardingChecklist";

const CATEGORIES = [
  ["phones-gadgets", "📱", "Phones & Gadgets"],
  ["tech-computing", "💻", "Tech & Computing"],
  ["apparel-fashion", "👕", "Apparel & Fashion"],
  ["home-appliances", "🏠", "Home Appliances"],
  ["beauty-personal-care", "💄", "Beauty & Care"],
  ["ankara-art", "🎨", "Ankara & Art"],
];


const TRUST = [
  ["🔒", "Escrow protection", "Your money is held until you confirm delivery."],
  ["📲", "Pay with M-Pesa", "Top up your wallet and shop in seconds."],
  ["🔑", "Delivery PIN", "Sellers are paid only when you hand over your PIN."],
  ["💬", "Private chat", "Message sellers with end-to-end encryption."],
];

const STEPS = [
  ["1", "Find something you love", "Browse verified shops in the MarketHub."],
  ["2", "Pay safely", "Your payment goes into escrow, not straight to the seller."],
  ["3", "Confirm on delivery", "Give the seller your PIN once your item arrives."],
];

const PHASES = [["Phase 1", 100], ["Phase 2", 200], ["Phase 3", 500], ["Phase 4", 1000]];

const money = (n) => `KSh ${Number(n || 0).toLocaleString("en-KE")}`;

function ProductTile({ p }) {
  return (
    <Link to={productPath(p._id)} className="group block overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="aspect-square overflow-hidden bg-slate-50">
        {p.imageUrl ? <img src={p.imageUrl} alt={p.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : null}
      </div>
      <div className="p-3">
        {p.brandName && <p className="truncate text-[10px] font-black uppercase tracking-wider text-emerald-700">{p.brandName}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-sm font-bold text-slate-900">{p.name}</h3>
        <p className="mt-1 text-base font-black text-emerald-800">{money(p.price)}</p>
      </div>
    </Link>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  const { onAuthClick, onSearchUpdate } = useOutletContext() || {};
  const [q, setQ] = useState("");
  const [featured, setFeatured] = useState(null); // null = loading

  const signedIn = auth.authenticated;
  const isMarketer = auth.destination === "dashboard";
  const isBuyer = signedIn && auth.user?.accountCategory === "retail";

  useEffect(() => {
    let cancelled = false;
    apiClient.get("/products/hero-banner")
      .then(({ data }) => !cancelled && setFeatured((data.banner || []).slice(0, 4)))
      .catch(() => !cancelled && setFeatured([]));
    return () => { cancelled = true; };
  }, []);

  const goSearch = (term) => {
    onSearchUpdate?.({ q: term.trim().toLowerCase(), type: "" });
    navigate(ROUTES.MARKETPLACE);
  };

  return (
    <div className="bg-white">
      <WelcomeSheet onSignIn={onAuthClick} />
      {/* HERO */}
      <section className="relative overflow-hidden bg-emerald-950 text-white">
        <img src={heroBg} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900/90 to-emerald-700/60" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-emerald-200">
              Kenya's trusted digital market
            </span>
            <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
              Shop trusted sellers.<br className="hidden sm:block" /> Pay safely. Grow with us.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-emerald-50/90 sm:text-base">
              Buy from verified Kenyan shops with your M-Pesa wallet. Every payment is held in escrow until your order arrives.
            </p>

            <form onSubmit={(e) => { e.preventDefault(); goSearch(q); }} className="mt-6 flex max-w-xl overflow-hidden rounded-full bg-white p-1.5 shadow-lg">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products, brands or categories…" aria-label="Search the MarketHub"
                className="min-w-0 flex-1 bg-transparent px-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none" />
              <button type="submit" className="shrink-0 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">Search</button>
            </form>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link to={ROUTES.MARKETPLACE} className="rounded-full bg-white px-6 py-3 text-sm font-black text-emerald-900 shadow hover:bg-emerald-50">Shop the MarketHub →</Link>
              {!signedIn && <button type="button" onClick={() => onAuthClick?.()} className="rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Create free account</button>}
              {isBuyer && <Link to={ROUTES.BECOME_MARKETER} className="rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">Start selling</Link>}
              {isMarketer && <Link to={ROUTES.MEMBER_DASHBOARD} className="rounded-full border border-white/40 px-6 py-3 text-sm font-bold text-white hover:bg-white/10">My dashboard</Link>}
            </div>
          </div>
        </div>
      </section>

      {signedIn && (
  <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6"><OnboardingChecklist /></div>
)}

      {/* TRUST BAR */}
      <section className="border-b border-slate-100 bg-emerald-50/50">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-6 sm:px-6 lg:grid-cols-4">
          {TRUST.map(([icon, title, text]) => (
            <div key={title} className="flex items-start gap-3">
              <span className="text-xl" aria-hidden="true">{icon}</span>
              <div><p className="text-xs font-black text-slate-900 sm:text-sm">{title}</p><p className="text-[11px] leading-snug text-slate-600 sm:text-xs">{text}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* FRESH ON MARKETHUB */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div><h2 className="text-xl font-black text-slate-900 sm:text-2xl">Fresh on the MarketHub</h2><p className="text-xs text-slate-500 sm:text-sm">Popular picks from our verified sellers.</p></div>
          <Link to={ROUTES.MARKETPLACE} className="shrink-0 text-sm font-bold text-emerald-700 hover:underline">See all →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {featured === null
            ? Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-slate-100" />)
            : featured.map((p) => <ProductTile key={p._id} p={p} />)}
        </div>
        {featured && featured.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            New products are on the way. <Link to={ROUTES.MARKETPLACE} className="font-bold text-emerald-700 underline">Visit the MarketHub</Link>
          </p>
        )}
      </section>

      {/* CATEGORIES */}
      <section className="bg-slate-50 py-10 sm:py-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="mb-5 text-xl font-black text-slate-900 sm:text-2xl">Shop by category</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {CATEGORIES.map(([slug, icon, label]) => (
              <button key={slug} type="button" onClick={() => goSearch(slug)}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-3 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md">
                <span className="text-3xl" aria-hidden="true">{icon}</span>
                <span className="text-xs font-bold text-slate-800 sm:text-sm">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <h2 className="mb-6 text-center text-xl font-black text-slate-900 sm:text-2xl">How buying on Sokodigi works</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map(([n, title, text]) => (
            <div key={n} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-700 text-sm font-black text-white">{n}</span>
              <h3 className="mt-3 text-sm font-black text-slate-900">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 sm:text-sm">{text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SELL AND EARN */}
      {!isMarketer && (
        <section className="px-4 pb-10 sm:px-6 sm:pb-14">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 to-emerald-700 p-6 text-white sm:p-10">
            <div className="grid items-center gap-6 lg:grid-cols-2">
              <div>
                <h2 className="text-2xl font-black sm:text-3xl">Run your own shop on Sokodigi</h2>
                <p className="mt-3 text-sm leading-relaxed text-emerald-50/90">
                  Open a shop page, list your products and get paid safely through escrow. Promote other sellers' products for a 5% bonus, and grow a team for network commissions.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {isBuyer
                    ? <Link to={ROUTES.BECOME_MARKETER} className="rounded-full bg-white px-6 py-3 text-sm font-black text-emerald-900 hover:bg-emerald-50">Start selling</Link>
                    : <button type="button" onClick={() => onAuthClick?.()} className="rounded-full bg-white px-6 py-3 text-sm font-black text-emerald-900 hover:bg-emerald-50">Join as a seller</button>}
                </div>
                <p className="mt-4 text-[11px] text-emerald-100/80">Earnings depend on your sales and activity and are not guaranteed. Network commissions are paid only to active members.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {PHASES.map(([name, fee]) => (
                  <div key={name} className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">{name}</p>
                    <p className="mt-1 text-xl font-black">{money(fee)}</p>
                    <p className="text-[11px] text-emerald-100/80">per month</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* FINAL CALL TO ACTION */}
      <section className="border-t border-slate-100 bg-emerald-50/50 px-4 py-10 text-center sm:py-14">
        <h2 className="text-xl font-black text-slate-900 sm:text-2xl">Ready to see what's on the MarketHub?</h2>
        <Link to={ROUTES.MARKETPLACE} className="mt-5 inline-block rounded-full bg-emerald-700 px-8 py-3 text-sm font-black text-white hover:bg-emerald-800">Browse products →</Link>
      </section>
    </div>
  );
}
