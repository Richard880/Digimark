import { Link } from "react-router-dom";
import brand from "../../constants/brand";
import ROUTES from "../../constants/routes";
import useAuth from "../../features/auth/hooks/useAuth";

const VALUES = [
  ["🛍️", "Shop"],
  ["🤝", "Connect"],
  ["📈", "Grow"],
  ["🛡️", "Trust"],
];

function Column({ title, children }) {
  return (
    <nav aria-label={title}>
      <h2 className="text-xs font-black uppercase tracking-wider text-emerald-900">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm text-slate-600">{children}</ul>
    </nav>
  );
}

const A = ({ to, children }) => (
  <li>
    <Link to={to} className="transition hover:text-emerald-800 hover:underline">{children}</Link>
  </li>
);

export default function Footer() {
  const { auth } = useAuth();
  const signedIn = auth.authenticated;
  const isMarketer = auth.destination === "dashboard";
  const isBuyer = signedIn && auth.user?.accountCategory === "retail";
  const year = new Date().getFullYear();

  return (
    <footer className="mt-10 border-t border-slate-100 bg-white pb-20 lg:pb-0">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="sm:col-span-2 lg:col-span-1">
            {brand.logo ? (
              <img src={brand.logo} alt={brand.name || "Sokodigi"} className="h-12 w-auto" />
            ) : (
              <span className="text-xl font-black text-emerald-800">{brand.name || "Sokodigi"}</span>
            )}
            <p className="mt-3 text-sm font-bold text-emerald-900">{brand.tagline || "Your digital market & business community"}</p>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              Shop from verified Kenyan sellers. Every payment is held in escrow until you confirm delivery, and you can pay with M-Pesa.
            </p>
          </div>

          <Column title="Shop">
            <A to={ROUTES.MARKETPLACE}>All products</A>
            <A to={ROUTES.MARKETPLACE}>Featured shops</A>
            <A to={ROUTES.MARKETPLACE}>Hot deals</A>
            {signedIn && <A to={ROUTES.MY_PROFILE}>My orders</A>}
            {signedIn && <A to={ROUTES.WALLET}>My wallet</A>}
          </Column>

          <Column title="Sell & Earn">
            {isMarketer ? (
              <>
                <A to={ROUTES.MEMBER_DASHBOARD}>My dashboard</A>
                <A to={ROUTES.MY_TEAM}>My team</A>
                <A to={ROUTES.MEMBERSHIP}>Membership</A>
              </>
            ) : (
              <>
                <A to={isBuyer ? ROUTES.BECOME_MARKETER : ROUTES.REGISTER}>{isBuyer ? "Become a seller" : "Open your shop"}</A>
                {signedIn && <A to={ROUTES.MEMBERSHIP}>Membership plans</A>}
                {!signedIn && <A to={ROUTES.REGISTER}>Create a free account</A>}
              </>
            )}
          </Column>

          <Column title="Support">
            <A to="/terms">Terms of use</A>
            <A to="/privacy">Privacy policy</A>
            <li>
              {brand.supportEmail ? (
                <a href={`mailto:${brand.supportEmail}`} className="transition hover:text-emerald-800 hover:underline">Contact us</a>
              ) : (
                <span className="text-slate-400">Contact us (coming soon)</span>
              )}
            </li>
          </Column>
        </div>

        {/* Values */}
        <ul className="mt-10 flex flex-wrap justify-center gap-2 border-y border-slate-100 py-5 sm:gap-3" aria-label="What we stand for">
          {VALUES.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-extrabold uppercase tracking-wider text-emerald-900">
              <span aria-hidden="true">{icon}</span>{label}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col items-center justify-between gap-3 text-xs text-slate-500 sm:flex-row">
          <p>© {year} {brand.name || "Sokodigi"}. All rights reserved.</p>
          <p className="max-w-md text-center sm:text-right">
            Earnings from selling and promotion depend on your own sales and activity and are not guaranteed.
          </p>
        </div>
      </div>
    </footer>
  );
}
