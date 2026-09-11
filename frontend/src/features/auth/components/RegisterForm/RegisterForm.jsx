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
    formState: { errors },
  } = useRegisterForm();

  // Intercept form submissions to cleanly auto-close modal on registration success
  const onSubmitHandler = async (e) => {
    e.preventDefault();
    await handleRegister(e);
  };

  return (
    <section className="sokodigi-auth-grid-reg">
      
      {/* 🟢 LEFT SIDE: EMERALD GREEN HERO BACKDROP */}
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
            {/* 🎯 ADDED: Stable alignment node for Sponsor Identification details */}
            <div className="mt-2">
              <AuthInput
                type="text"
                placeholder="Sponsor ID (Optional)"
                icon="diagram-3"
                error={errors.sponsorId?.message}
                {...register("sponsorId")}
              />
            </div>
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
