import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useWatch } from "react-hook-form";
import AuthShell from "../AuthShell/AuthShell";
import AuthField from "../AuthField/AuthField";
import { NetworkExplainerSheet } from "../../../membership/NetworkExplainer";
import useRegisterForm from "../../forms/useRegisterForm";
import ROUTES from "../../../../constants/routes";

const CARDS = [
  ["retail", "🛍️", "Shop on Sokodigi", "Buy with your wallet. No membership fee."],
  ["network", "💼", "Sell & earn", "Open a shop and join the network. Monthly membership from Ksh 100."],
];

const Rule = ({ ok, children }) => (
  <li className={`flex items-center gap-1.5 ${ok ? "font-semibold text-emerald-700" : "text-slate-500"}`}><span aria-hidden="true">{ok ? "✓" : "○"}</span>{children}</li>
);
const Title = ({ children }) => <h2 className="mb-2 text-[11px] font-black uppercase tracking-wider text-slate-400">{children}</h2>;

function RegisterForm({ onToggleMode, onClose, onRegistered }) {
  const { register, control, formState: { errors }, handleRegister, loading, authError, photoPreview, onPhotoChange } = useRegisterForm({ onRegistered });

  const selected = useWatch({ control, name: "accountCategory", defaultValue: "retail" });
  const pw = useWatch({ control, name: "password", defaultValue: "" }) || "";
  const [explainer, setExplainer] = useState(false);
  const fileRef = useRef(null);
  const errRef = useRef(null);

  useEffect(() => { if (authError) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }, [authError]);

  return (
    <AuthShell title="Create your account" subtitle="Join Kenya's trusted digital market" onClose={onClose}>
      {authError && <p ref={errRef} role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{authError}</p>}

      <form onSubmit={handleRegister} noValidate className="space-y-6">
        <div>
          <Title>I want to</Title>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Account type">
            {CARDS.map(([value, icon, title, text]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${selected === value ? "border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 bg-white hover:border-emerald-300"}`}>
                <input type="radio" value={value} className="sr-only" {...register("accountCategory")} />
                <span className="text-2xl" aria-hidden="true">{icon}</span>
                <span className="min-w-0"><b className="block text-sm text-slate-900">{title}</b><span className="text-[11px] leading-snug text-slate-500">{text}</span></span>
              </label>
            ))}
          </div>
          {selected === "network" && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
              Next you'll verify your email and set up your brand. Your shop goes live after your first membership payment. Network earnings aren't guaranteed.{" "}
              <button type="button" onClick={() => setExplainer(true)} className="font-bold underline">How the network works</button>
            </p>
          )}
        </div>

        <div>
          <Title>Your details</Title>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xl text-slate-400">
                {photoPreview ? <img src={photoPreview} alt="Your profile preview" className="h-full w-full object-cover" /> : <span aria-hidden="true">👤</span>}
              </span>
              <div>
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} disabled={loading} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={loading} className="min-h-10 rounded-xl border border-slate-300 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50">{photoPreview ? "Change photo" : "Add a photo (optional)"}</button>
                <p className="mt-1 text-[11px] text-slate-500">JPG, PNG or WebP, up to 5 MB.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AuthField label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register("firstName")} />
              <AuthField label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register("lastName")} />
            </div>
            <AuthField label="Email address" type="email" inputMode="email" autoComplete="email" error={errors.email?.message} {...register("email")} />
            <AuthField label="M-Pesa phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712345678"
              hint="Withdrawals are sent to this number. It can't be changed later." error={errors.phoneNumber?.message} {...register("phoneNumber")} />
          </div>
        </div>

        <div>
          <Title>Password</Title>
          <div className="space-y-3">
            <AuthField label="Password" type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
            <ul className="grid gap-1 text-[11px] sm:grid-cols-3" aria-label="Password rules">
              <Rule ok={pw.length >= 8}>8+ characters</Rule>
              <Rule ok={/[A-Z]/.test(pw)}>A capital letter</Rule>
              <Rule ok={/[0-9!@#$%^&*]/.test(pw)}>A number or symbol</Rule>
            </ul>
            <AuthField label="Confirm password" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register("confirmPassword")} />
          </div>
        </div>

        <div>
          <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-700">
            <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-emerald-700" {...register("acceptTerms")} />
            <span>I agree to the{" "}
              <Link to={ROUTES.TERMS} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-700 underline">Terms of use</Link> and{" "}
              <Link to={ROUTES.PRIVACY} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-700 underline">Privacy policy</Link>.
            </span>
          </label>
          {errors.acceptTerms?.message && <p role="alert" className="mt-1 text-xs font-semibold text-red-600">{errors.acceptTerms.message}</p>}
        </div>

        <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:backdrop-blur-none" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <button type="submit" disabled={loading} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60">
            {loading ? "Creating your account…" : "Create account"}
          </button>
          {onToggleMode && (
            <p className="mt-3 text-center text-xs text-slate-600">Already have an account?{" "}
              <button type="button" onClick={onToggleMode} className="font-bold text-emerald-700 underline">Sign in</button></p>
          )}
        </div>
      </form>

      {explainer && <NetworkExplainerSheet onClose={() => setExplainer(false)} />}
    </AuthShell>
  );
}

export default RegisterForm;
