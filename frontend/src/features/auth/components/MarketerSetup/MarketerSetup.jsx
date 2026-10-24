import { useState } from "react";
import { useForm } from "react-hook-form";
import { sendEmailVerification } from "firebase/auth";
import { auth as firebaseAuth } from "../../../../firebase";
import useAuth from "../../hooks/useAuth";
import AuthField from "../AuthField/AuthField";
import { NetworkExplainerSheet } from "../../../membership/NetworkExplainer";
import { becomeMarketer, patchProfile, friendlyError } from "../../authApi";
import { getReferral, clearReferral } from "../../../../utils/referral";

const CATEGORIES = [
  ["phones-gadgets", "Phones & Gadgets"], ["tech-computing", "Tech & Computing"], ["apparel-fashion", "Apparel & Fashion"],
  ["home-appliances", "Home Appliances"], ["beauty-personal-care", "Beauty & Care"], ["ankara-art", "Ankara & Art"], ["general", "General Goods"],
];
const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
const SPONSOR_RE = /^(SDK-\d{6,9}|[a-zA-Z0-9_]{3,20})$/i;

const alertBox = "rounded-xl border px-4 py-3 text-sm font-semibold";

export default function MarketerSetup({ onDone }) {
  const { auth, refreshProfile } = useAuth();
  const profile = auth.profile || {};
  const referral = auth.referral; // saved at signup: this person always wins
  const needUsername = !profile.username; // chosen once: it becomes the shop URL
  const needPhone = !profile.phoneNumber; // set once: payouts go to it

  const [step, setStep] = useState(firebaseAuth.currentUser?.emailVerified ? "details" : "verify");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [explainer, setExplainer] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: {
      sponsor: getReferral() || "",
      brandName: profile.brandName || "",
      brandCategory: profile.brandCategory || "",
      county: profile.location?.county || "",
      address: profile.address || "",
    },
  });

  const checkVerified = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      await firebaseAuth.currentUser.reload();
      if (!firebaseAuth.currentUser.emailVerified) setErr("We can't see your verification yet. Tap the link in the email, then try again.");
      else setStep("details");
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  const resend = async () => {
    setErr(""); setMsg("");
    try { await sendEmailVerification(firebaseAuth.currentUser); setMsg("Verification email sent."); }
    catch (e) { setErr(friendlyError(e)); }
  };

  const submit = handleSubmit(async (v) => {
    setErr(""); setBusy(true);
    try {
      if (needPhone) await patchProfile({ phoneNumber: v.phoneNumber.replace(/[\s-]/g, "") });
      await becomeMarketer({
        username: needUsername ? v.username.trim().toLowerCase() : undefined,
        brandName: v.brandName.trim(),
        brandCategory: v.brandCategory,
        county: v.county.trim(),
        address: v.address.trim(),
        sponsor: referral ? undefined : v.sponsor?.trim() || undefined,
      });
      clearReferral();
      await refreshProfile(true); // the app now knows this is a marketer account
      onDone?.();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  });

  return (
    <div className="mx-auto w-full max-w-lg p-5 sm:p-8">
      {err && <p role="alert" className={`${alertBox} mb-4 border-red-200 bg-red-50 text-red-700`}>{err}</p>}
      {msg && <p role="status" className={`${alertBox} mb-4 border-emerald-200 bg-emerald-50 text-emerald-800`}>{msg}</p>}

      {step === "verify" ? (
        <div className="space-y-4">
          <div className="text-center"><p className="text-4xl" aria-hidden="true">✉️</p>
            <h1 className="mt-2 text-xl font-black text-slate-900">Verify your email</h1>
            <p className="mt-2 text-sm text-slate-600">We sent a link to <b>{firebaseAuth.currentUser?.email}</b>. Marketer accounts need a verified email because they receive payouts.</p></div>
          <button type="button" onClick={checkVerified} disabled={busy} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-60">{busy ? "Checking…" : "I've verified my email"}</button>
          <button type="button" onClick={resend} className="min-h-10 w-full text-xs font-bold text-emerald-700 underline">Resend the email</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div><h1 className="text-xl font-black text-slate-900">Set up your brand</h1>
            <p className="mt-1 text-sm text-slate-600">This becomes your public Sokodigi shop page.</p></div>

          {needUsername && <AuthField label="Shop username" placeholder="e.g. amina_crafts" autoCapitalize="none" autoCorrect="off" hint="3 to 20 letters, numbers or underscores. This can't be changed later." error={errors.username?.message}
            {...register("username", { required: "Choose a shop username", pattern: { value: USERNAME_RE, message: "3–20 letters, numbers or underscores" } })} />}
          {needPhone && <AuthField label="M-Pesa phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="0712345678" hint="Payouts go to this number. It can't be changed later." error={errors.phoneNumber?.message}
            {...register("phoneNumber", { required: "Phone number is required", pattern: { value: PHONE_RE, message: "Enter a Kenyan number, e.g. 0712345678" } })} />}

          <AuthField label="Brand name" error={errors.brandName?.message}
            {...register("brandName", { required: "Brand name is required", minLength: { value: 2, message: "Too short" }, maxLength: { value: 60, message: "Too long" } })} />
          <AuthField as="select" label="What will you sell?" error={errors.brandCategory?.message} {...register("brandCategory", { required: "Choose a category" })}>
            <option value="">Choose a category</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </AuthField>
          <div className="grid gap-4 sm:grid-cols-2">
            <AuthField label="County" autoComplete="address-level1" error={errors.county?.message} {...register("county", { required: "County is required" })} />
            <AuthField label="Town or address" autoComplete="street-address" error={errors.address?.message} {...register("address", { required: "Address is required", minLength: { value: 5, message: "Too short" } })} />
          </div>

          {referral ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Referred by <b>{referral.name || `@${referral.username}`}</b>. You'll join their team.</p>
          ) : (
            <AuthField label="Sponsor's ID or username (optional)" placeholder="e.g. SDK-001001 or amina_crafts" autoCapitalize="none" autoCorrect="off" hint="Leave blank to join directly under Sokodigi." error={errors.sponsor?.message}
              {...register("sponsor", { pattern: { value: SPONSOR_RE, message: "Enter a sponsor ID like SDK-001001, or a username" } })} />
          )}

          <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">Membership costs from Ksh 100 a month, and network earnings aren't guaranteed. You'll confirm this again before you pay.{" "}
            <button type="button" onClick={() => setExplainer(true)} className="font-bold underline">How the network works</button></p>

          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60">{busy ? "Saving…" : "Continue to membership"}</button>
        </form>
      )}
      {explainer && <NetworkExplainerSheet onClose={() => setExplainer(false)} />}
    </div>
  );
}
