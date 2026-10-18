import { useWatch } from "react-hook-form";
import { AuthInput } from "../AuthInput/AuthInput";
import Checkbox from "../../../../components/ui/Checkbox";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";
import useRegisterForm from "../../forms/useRegisterForm";
import "./registerForm.css";
import SokoLogo from "../../../../assets/logo.png";

const CARD_BASE = { borderRadius: "8px", padding: "12px", cursor: "pointer", display: "block" };

function CategoryCard({ value, selected, title, text, register }) {
  const on = selected === value;
  return (
    <label
      style={{
        ...CARD_BASE,
        border: on ? "2px solid #059669" : "1px solid #e5e7eb",
        backgroundColor: on ? "#ecfdf5" : "#fff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <input type="radio" value={value} {...register("accountCategory")} style={{ accentColor: "#059669" }} />
        <span style={{ fontWeight: 600, fontSize: "14px" }}>{title}</span>
      </div>
      <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginLeft: "22px" }}>{text}</p>
    </label>
  );
}

function RegisterForm({ onToggleMode, onClose, onRegistered }) {
  const {
    register, control, formState: { errors },
    handleRegister, loading, authError, photoPreview, onPhotoChange,
  } = useRegisterForm({ onRegistered });

  const selected = useWatch({ control, name: "accountCategory", defaultValue: "retail" });

  return (
    <section className="sokodigi-auth-grid-reg">
      <div className="auth-hero-side-reg">
        <div className="circle-shape-reg top-bubble-reg" />
        <div className="circle-shape-reg center-bubble-reg" />
        <div className="circle-shape-reg bottom-bubble-reg" />
        {onClose && (
          <div className="back-to-home-wrapper-reg">
            <button type="button" onClick={onClose} className="back-home-link-reg bg-transparent border-0 p-0 cursor-pointer">
              <i className="bi bi-arrow-left" aria-hidden="true" />
              <span>Back to Home</span>
            </button>
          </div>
        )}
        <div className="hero-content-overlay-reg">
          <div className="hero-logo-frame-reg">
            <img src={SokoLogo} alt="Sokodigi Logo" className="hero-logo-image-reg" />
            <div className="logo-ring-pulse-reg" />
          </div>
          <h1 className="sokodigi-title-reg">JOIN US</h1>
          <h2 className="sokodigi-headline-reg">SOKODIGI</h2>
          <p className="sokodigi-subtitle-reg">Your Digital Market &amp; Business Community</p>
        </div>
      </div>

      <div className="auth-input-side-reg">
        <div className="input-side-header-reg">
          <h2 className="welcome-text-reg">Create Your Account</h2>
          <p className="welcome-subtext-reg">Please fill out the sections below to complete registration.</p>
        </div>

        {authError && <Alert variant="error" title="Registration Failed">{authError}</Alert>}

        <form onSubmit={handleRegister} noValidate className="register-form-ws">
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">I want to</h6>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
              <CategoryCard
                value="retail" selected={selected} register={register}
                title="Shop on Sokodigi"
                text="Buy products with your wallet. No membership fee, no network."
              />
              <CategoryCard
                value="network" selected={selected} register={register}
                title="Sell &amp; Earn (Marketer)"
                text="Open your own shop and join the affiliate network. A monthly membership applies."
              />
            </div>
            {selected === "network" && (
              <p style={{ fontSize: "11px", color: "#6b7280", marginBottom: "12px" }}>
                After you create your account you'll verify your email and set up your brand. Your shop goes live once your first membership payment is made.
              </p>
            )}
          </div>

          {/* PROFILE PICTURE */}
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Profile Picture (optional)</h6>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", background: "#f1f5f9", border: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {photoPreview ? (
                  <img src={photoPreview} alt="Your profile preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <i className="bi bi-person" style={{ fontSize: 28, color: "#94a3b8" }} aria-hidden="true" />
                )}
              </div>
              <div>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} disabled={loading} style={{ fontSize: 12 }} />
                <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: 4 }}>JPG, PNG or WebP, up to 5 MB.</p>
              </div>
            </div>
          </div>

          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Personal Information</h6>
            <div className="form-row-ws">
              <AuthInput placeholder="First Name" icon="person" required autoComplete="given-name"
                error={errors.firstName?.message} {...register("firstName")} />
              <AuthInput placeholder="Last Name" icon="person" required autoComplete="family-name"
                error={errors.lastName?.message} {...register("lastName")} />
            </div>
          </div>

          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Contact Information</h6>
            <AuthInput type="email" placeholder="Email Address" icon="envelope" required autoComplete="email"
              error={errors.email?.message} {...register("email")} />
            <AuthInput type="tel" placeholder="Phone Number (M-Pesa)" icon="telephone" required autoComplete="tel"
              error={errors.phoneNumber?.message} {...register("phoneNumber")} />
          </div>

          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Security</h6>
            <div className="form-row-ws">
              <AuthInput type="password" placeholder="Password" icon="lock" required autoComplete="new-password"
                error={errors.password?.message} {...register("password")} />
              <AuthInput type="password" placeholder="Confirm Password" icon="lock-fill" required autoComplete="new-password"
                error={errors.confirmPassword?.message} {...register("confirmPassword")} />
            </div>
          </div>

          <div className="terms-checkbox-wrapper">
            <Checkbox
              label="I agree to the Terms & Conditions and Privacy Policy."
              error={errors.acceptTerms?.message}
              {...register("acceptTerms")}
            />
          </div>

          <Button type="submit" loading={loading} className="register-button-ws">Create Account</Button>

          {onToggleMode && (
            <div className="register-footer-ws">
              <span>Already have an account?</span>
              <button type="button" onClick={onToggleMode}
                className="login-link-ws bg-transparent border-0 p-0 font-semibold underline text-emerald-600 hover:text-emerald-700 cursor-pointer ml-1">
                Sign In
              </button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}

export default RegisterForm;
