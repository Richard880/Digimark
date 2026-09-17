import { useWatch } from "react-hook-form"; // 🎯 Brought in to watch form changes conditionally
import { AuthInput } from "../AuthInput/AuthInput"; 
import Checkbox from "../../../../components/ui/Checkbox";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";
import useRegisterForm from "../../forms/useRegisterForm";
import "./registerForm.css";

import SokoLogo from "../../../../assets/logo.png";  
 

function RegisterForm({ onToggleMode, onClose }) {
  const {
    register,
    handleRegister,
    loading,
    authError,
    control, // Extract control from your form hook to watch values in real-time
    formState: { errors },
  } = useRegisterForm();

  // 🎯 THE FIX: Watch the active accountCategory selection in real-time
  const selectedCategory = useWatch({
    control,
    name: "accountCategory",
    defaultValue: "retail" // Baseline safe default matching Layer 1 schema
  });

  // Intercept form submissions to cleanly auto-close modal on registration success
  const onSubmitHandler = async (e) => {
    e.preventDefault();
    await handleRegister(e);
  };

  return (
    <section className="sokodigi-auth-grid-reg">
      
      {/* LEFT SIDE: EMERALD GREEN HERO BACKDROP */}
      <div className="auth-hero-side-reg">
        <div className="circle-shape-reg top-bubble-reg" />
        <div className="circle-shape-reg center-bubble-reg" />
        <div className="circle-shape-reg bottom-bubble-reg" />
        
        {/* Close modal wrapper seamlessly when hitting back button */}
        <div className="back-to-home-wrapper-reg">
          <button type="button" onClick={onClose} className="back-home-link-reg bg-transparent border-0 p-0 cursor-pointer">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            <span>Back to Home</span>
          </button>
        </div>

        <div className="hero-content-overlay-reg">
          <div className="hero-logo-frame-reg">
            <img src={SokoLogo} alt="Sokodigi Logo" className="hero-logo-image-reg" />
            <div className="logo-ring-pulse-reg" />
          </div>
          <h1 className="sokodigi-title-reg">JOIN US</h1>
          <h2 className="sokodigi-headline-reg">SOKODIGI</h2>
          <p className="sokodigi-subtitle-reg">
            Your Digital Market &amp; Business Community
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: INTERNALLY SCROLLABLE INPUT MATRIX SHEET */}
      <div className="auth-input-side-reg">
        <div className="input-side-header-reg">
          <h2 className="welcome-text-reg">Create Your Account</h2>
          <p className="welcome-subtext-reg">Please fill out the sections below to complete registration.</p>
        </div>

        {authError && (
          <Alert variant="error" title="Registration Failed">
            {authError}
          </Alert>
        )}

        <form onSubmit={onSubmitHandler} noValidate className="register-form-ws">
          
          {/* 🎯 NEW SECTION: ACCOUNT TRACK CATEGORY SELECTOR CARDS */}
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Select Account Purpose</h6>
            <div className="account-category-card-group" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
              
              {/* RETAIL SELECTION CARD */}
              <label 
                className={`category-card-label ${selectedCategory === "retail" ? "active-border-emerald" : ""}`}
                style={{
                  border: selectedCategory === "retail" ? "2px solid #059669" : "1px solid #e5e7eb",
                  borderRadius: "8px", padding: "12px", cursor: "pointer", display: "block", backgroundColor: selectedCategory === "retail" ? "#ecfdf5" : "#fff"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" value="retail" {...register("accountCategory")} style={{ accentColor: "#059669" }} />
                  <span style={{ fontWeight: "600", fontSize: "14px" }}>Retail / Storefront</span>
                </div>
                <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginLeft: "22px" }}>Shop products or configure traditional local merchant business portals without network marketing items.</p>
              </label>

              {/* NETWORK SELECTION CARD */}
              <label 
                className={`category-card-label ${selectedCategory === "network" ? "active-border-emerald" : ""}`}
                style={{
                  border: selectedCategory === "network" ? "2px solid #059669" : "1px solid #e5e7eb",
                  borderRadius: "8px", padding: "12px", cursor: "pointer", display: "block", backgroundColor: selectedCategory === "network" ? "#ecfdf5" : "#fff"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="radio" value="network" {...register("accountCategory")} style={{ accentColor: "#059669" }} />
                  <span style={{ fontWeight: "600", fontSize: "14px" }}>Network Affiliate</span>
                </div>
                <p style={{ fontSize: "11px", color: "#6b7280", marginTop: "4px", marginLeft: "22px" }}>Join the forced matrix tree structural network, unlock auto-spillovers, and track commission metrics loops.</p>
              </label>

            </div>
          </div>

          {/* SECTION 1: PERSONAL INFORMATION */}
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Personal Information</h6>
            <div className="form-row-ws">
              <AuthInput
                placeholder="First Name"
                icon="person"
                required
                error={errors.firstName?.message}
                autoComplete="given-name"
                {...register("firstName")}
              />
              <AuthInput
                placeholder="Last Name"
                icon="person"
                required
                error={errors.lastName?.message}
                autoComplete="family-name"
                {...register("lastName")}
              />
            </div>
          </div>

          {/* SECTION 2: CONTACT DETAILS */}
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Contact Information</h6>
            <AuthInput
              type="email"
              placeholder="Email Address"
              icon="envelope"
              required
              autoComplete="email"
              error={errors.email?.message}
              {...register("email")}
            />
            <AuthInput
              type="tel"
              placeholder="Phone Number"
              icon="telephone"
              required
              autoComplete="tel"
              error={errors.phoneNumber?.message}
              {...register("phoneNumber")}
            />
          </div>

          {/* SECTION 3: ACCOUNT PROTECTION & REFERRALS */}
          <div className="form-section-ws">
            <h6 className="form-section-title-ws">Security &amp; Network</h6>
            <div className="form-row-ws">
              <AuthInput
                type="password"
                placeholder="Password"
                icon="lock"
                required
                autoComplete="new-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <AuthInput
                type="password"
                placeholder="Confirm Password"
                icon="lock-fill"
                required
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
            </div>
            
            {/* 🎯 THE CONDITIONAL FIX: Only show Sponsor input if Network track category is active */}
            {selectedCategory === "network" && (
              <div className="mt-2 animation-fade-in">
                <AuthInput
                  type="text"
                  placeholder="Sponsor ID or Email (Optional)"
                  icon="diagram-3"
                  error={errors.sponsorId?.message}
                  {...register("sponsorId")}
                />
                <p style={{ fontSize: "11px", color: "#9ca3af", marginTop: "2px", paddingLeft: "8px" }}>Leave completely blank to register directly under the primary corporate system root account node.</p>
              </div>
            )}
          </div>

          <div className="terms-checkbox-wrapper">
            <Checkbox
              label="I agree to the Terms & Conditions and Privacy Policy."
              error={errors.acceptTerms?.message}
              {...register("acceptTerms")}
            />
          </div>

          <Button type="submit" loading={loading} className="register-button-ws">
            Create Account
          </Button>

          {/* Switch view modes via internal state modification */}
          <div className="register-footer-ws">
            <span>Already have an account?</span>
            <button 
              type="button" 
              onClick={onToggleMode} 
              className="login-link-ws bg-transparent border-0 p-0 font-semibold underline text-emerald-600 hover:text-emerald-700 cursor-pointer ml-1"
            >
              Sign In
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default RegisterForm;
