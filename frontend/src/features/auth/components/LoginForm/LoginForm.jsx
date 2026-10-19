import { useState } from "react";
import { AuthInput } from "../AuthInput/AuthInput";
import Checkbox from "../../../../components/ui/Checkbox";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";
import useLoginForm from "../../forms/useLoginForm";
import { requestPasswordReset, friendlyError } from "../../authApi";
import "./loginForm.css";

import SokoLogo from "../../../../assets/logo.png";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LoginForm({ onToggleMode, onClose }) {
  const {
    register,
    getValues,
    handleLogin,
    loading,
    authError,
    formState: { errors },
  } = useLoginForm(onClose);

  const [resetState, setResetState] = useState({ sending: false, message: "", error: "" });

  // Uses the email already typed above. The message is the same whether or not an account exists.
  const handleForgotPassword = async () => {
    if (resetState.sending) return;
    const email = String(getValues("email") || "").trim();
    if (!EMAIL_RE.test(email)) {
      setResetState({ sending: false, message: "", error: "Enter your email address above first, then tap “Forgot password?”." });
      return;
    }
    setResetState({ sending: true, message: "", error: "" });
    try {
      await requestPasswordReset(email);
      setResetState({
        sending: false,
        message: "If that email has a Sokodigi account, we've sent a link to reset your password.",
        error: "",
      });
    } catch (e) {
      setResetState({ sending: false, message: "", error: friendlyError(e) });
    }
  };

  return (
    <section className="sokodigi-auth-grid">
      {/* LEFT SIDE: EMERALD GREEN BRANDING PANE */}
      <div className="auth-hero-side">
        <div className="circle-shape top-bubble" />
        <div className="circle-shape center-bubble" />
        <div className="circle-shape bottom-bubble" />

        {onClose && (
          <div className="back-to-home-wrapper">
            <button type="button" onClick={onClose} className="back-home-link bg-transparent border-0 p-0 cursor-pointer">
              <i className="bi bi-arrow-left" aria-hidden="true" />
              <span>Back to Home</span>
            </button>
          </div>
        )}

        <div className="hero-content-overlay">
          <div className="hero-logo-frame">
            <img src={SokoLogo} alt="Sokodigi Official Logo Seal" className="hero-logo-image" />
            <div className="logo-ring-pulse" />
          </div>

          <h1 className="sokodigi-title-ws">WELCOME</h1>
          <h2 className="sokodigi-headline-ws">SOKODIGI</h2>
          <p className="sokodigi-subtitle-ws">Your Digital Market &amp; Business Community</p>
        </div>
      </div>

      {/* RIGHT SIDE: INPUT FORM */}
      <div className="auth-input-side">
        <div className="input-side-header">
          <h2 className="welcome-text-ws">Sign in</h2>
        </div>

        {authError && (
          <Alert variant="error" title="Login Failed">
            {authError}
          </Alert>
        )}
        {resetState.error && (
          <Alert variant="error" title="Password reset">
            {resetState.error}
          </Alert>
        )}
        {resetState.message && (
          <Alert variant="success" title="Check your email">
            {resetState.message}
          </Alert>
        )}

        <form onSubmit={handleLogin} noValidate className="login-form-ws">
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

          <div className="login-options-ws" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Checkbox label="Remember me" {...register("rememberMe")} />
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={resetState.sending || loading}
              className="bg-transparent border-0 p-0 underline text-emerald-600 hover:text-emerald-700 cursor-pointer"
              style={{ fontSize: 13 }}
            >
              {resetState.sending ? "Sending…" : "Forgot password?"}
            </button>
          </div>

          <Button type="submit" loading={loading} className="login-button-ws">
            Sign In
          </Button>

          {onToggleMode && (
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
          )}
        </form>
      </div>
    </section>
  );
}

export default LoginForm;
