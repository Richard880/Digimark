import { useState } from "react";
import { useForm } from "react-hook-form";
import { auth } from "../../../../firebase";
import { sendEmailVerification } from "firebase/auth";
import { AuthInput } from "../AuthInput/AuthInput";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";
import { becomeMarketer, friendlyError } from "../../authApi";

const CATEGORIES = [
  ["phones-gadgets", "Phones & Gadgets"], ["tech-computing", "Tech & Computing"],
  ["apparel-fashion", "Apparel & Fashion"], ["home-appliances", "Home Appliances"],
  ["beauty-personal-care", "Beauty & Care"], ["ankara-art", "Ankara & Art"], ["general", "General Goods"],
];

export default function MarketerSetup({ onDone }) {
  const [step, setStep] = useState(auth.currentUser?.emailVerified ? "details" : "verify");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: { sponsor: sessionStorage.getItem("sokodigi_sponsor") || "" },
  });

  const checkVerified = async () => {
    setErr(""); setMsg(""); setBusy(true);
    try {
      await auth.currentUser.reload();
      if (!auth.currentUser.emailVerified) setErr("We can't see your verification yet. Click the link in the email, then try again.");
      else setStep("details");
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  };

  const resend = async () => {
    setErr(""); setMsg("");
    try { await sendEmailVerification(auth.currentUser); setMsg("Verification email sent."); }
    catch (e) { setErr(friendlyError(e)); }
  };

  const submit = handleSubmit(async (v) => {
    setErr(""); setBusy(true);
    try {
      await becomeMarketer({
        username: v.username?.trim().toLowerCase(),
        brandName: v.brandName.trim(),
        brandCategory: v.brandCategory,
        county: v.county.trim(),
        address: v.address.trim(),
        sponsor: v.sponsor?.trim().toLowerCase() || undefined,
      });
      sessionStorage.removeItem("sokodigi_sponsor");
      onDone?.();
    } catch (e) { setErr(friendlyError(e)); } finally { setBusy(false); }
  });

  return (
    <div className="register-form-ws" style={{ maxWidth: 480, margin: "0 auto", padding: 24 }}>
      {err && <Alert variant="error" title="Hold on">{err}</Alert>}
      {msg && <Alert variant="success" title="Done">{msg}</Alert>}

      {step === "verify" ? (
        <>
          <h2 className="welcome-text-reg">Verify your email</h2>
          <p className="welcome-subtext-reg">
            We sent a link to {auth.currentUser?.email}. Marketer accounts need a verified email because they receive payouts.
          </p>
          <Button onClick={checkVerified} loading={busy}>I've verified my email</Button>
          <button type="button" onClick={resend} className="bg-transparent border-0 underline cursor-pointer" style={{ marginTop: 12 }}>
            Resend email
          </button>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <h2 className="welcome-text-reg">Set up your brand</h2>
          <p className="welcome-subtext-reg">This becomes your public Sokodigi shop page.</p>

          <AuthInput placeholder="Shop username (e.g. amina_crafts)" icon="at" error={errors.username?.message}
            {...register("username", { pattern: { value: /^[a-zA-Z0-9_]{3,20}$/, message: "3–20 letters, numbers or underscores" } })} />
          <AuthInput placeholder="Brand name" icon="shop" error={errors.brandName?.message}
            {...register("brandName", { required: "Brand name is required", minLength: { value: 2, message: "Too short" }, maxLength: { value: 60, message: "Too long" } })} />

          <select {...register("brandCategory", { required: "Choose a category" })}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: "1px solid #e5e7eb", margin: "8px 0" }}>
            <option value="">What will you sell?</option>
            {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {errors.brandCategory && <p style={{ color: "#dc2626", fontSize: 12 }}>{errors.brandCategory.message}</p>}

          <AuthInput placeholder="County" icon="geo-alt" error={errors.county?.message}
            {...register("county", { required: "County is required" })} />
          <AuthInput placeholder="Business address / town" icon="house" error={errors.address?.message}
            {...register("address", { required: "Address is required", minLength: { value: 5, message: "Too short" } })} />
          <AuthInput placeholder="Sponsor's username (optional)" icon="diagram-3" error={errors.sponsor?.message}
            {...register("sponsor", { pattern: { value: /^[a-zA-Z0-9_]{3,20}$/, message: "That doesn't look like a username" } })} />
          <p style={{ fontSize: 11, color: "#9ca3af" }}>Leave blank to join directly under Sokodigi.</p>

          <Button type="submit" loading={busy}>Continue to membership</Button>
        </form>
      )}
    </div>
  );
}
