import { AuthInput } from "../AuthInput/AuthInput"; 
import Checkbox from "../../../../components/ui/Checkbox";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";
import useLoginForm from "../../forms/useLoginForm";
import "./loginForm.css";

import SokoLogo from "../../../../assets/logo.png";  

function LoginForm({ onToggleMode, onClose }) {
  // 🟢 FIXED: Passed onClose closure downward into your optimized React Hook Form pipeline hook
  const {
    register,
    handleLogin,
    loading,
    authError,
    formState: { errors },
  } = useLoginForm(onClose); 

  const onSubmitHandler = async (e) => {
    e.preventDefault();
    await handleLogin(e);
  };

  return (
    <section className="sokodigi-auth-grid">
      
      {/* LEFT SIDE: EMERALD GREEN BRANDING PANE */}
      <div className="auth-hero-side">
        <div className="circle-shape top-bubble" />
        <div className="circle-shape center-bubble" />
        <div className="circle-shape bottom-bubble" />

        {/* Close modal wrapper seamlessly when hitting back button */}
        <div className="back-to-home-wrapper">
          <button type="button" onClick={onClose} className="back-home-link bg-transparent border-0 p-0 cursor-pointer">
            <i className="bi bi-arrow-left" aria-hidden="true" />
            <span>Back to Home</span>
          </button>
        </div>
        
        <div className="hero-content-overlay">
          <div className="hero-logo-frame">
            <img 
              src={SokoLogo} 
              alt="Sokodigi Official Logo Seal" 
              className="hero-logo-image" 
            />
            <div className="logo-ring-pulse" />
          </div>

          <h1 className="sokodigi-title-ws">WELCOME</h1>
          <h2 className="sokodigi-headline-ws">SOKODIGI</h2>
          <p className="sokodigi-subtitle-ws">
            Your Digital Market &amp; Business Community
          </p>
        </div>
      </div>

      {/* RIGHT SIDE: CLEAN TYPOGRAPHY INPUT FORM */}
      <div className="auth-input-side">
        <div className="input-side-header">
          <h2 className="welcome-text-ws">Sign in</h2>
        </div>

        {authError && (
          <Alert variant="error" title="Login Failed">
            {authError}
          </Alert>
        )}

        <form onSubmit={onSubmitHandler} noValidate className="login-form-ws">
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
            type="password"
            placeholder="Password"
            icon="lock"
            required
            autoComplete="current-password"
            error={errors.password?.message}
            {...register("password")}
          />

          <div className="login-options-ws">
            <Checkbox
              label="Remember me"
              {...register("rememberMe")}
            />
          </div>

          <Button type="submit" loading={loading} className="login-button-ws">
            Sign In
          </Button>

          {/* Switch seamlessly to Register view within modal layer */}
          <div className="login-footer-ws mt-4">
            <span>Don't have an account?</span>
            <button 
              type="button" 
              onClick={onToggleMode} 
              className="register-link-ws bg-transparent border-0 p-0 font-semibold underline text-emerald-600 hover:text-emerald-700 cursor-pointer ml-1"
            >
              Register Here
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

export default LoginForm;
