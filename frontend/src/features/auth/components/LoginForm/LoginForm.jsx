import { useState } from "react";
import { Link } from "react-router-dom";
import AuthShell from "../AuthShell/AuthShell";
import AuthField from "../AuthField/AuthField";
import useLoginForm from "../../forms/useLoginForm";
import { requestPasswordReset, friendlyError } from "../../authApi";
import ROUTES from "../../../../constants/routes";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function LoginForm({ onToggleMode, onClose }) {
  const { register, getValues, handleLogin, loading, authError, formState: { errors } } = useLoginForm(onClose);
  const [reset, setReset] = useState({ sending: false, message: "", error: "" });

  // Uses the email typed above. The message is the same whether or not an account exists.
  const forgot = async () => {
    if (reset.sending) return;
    const email = String(getValues("email") || "").trim();
    if (!EMAIL_RE.test(email)) return setReset({ sending: false, message: "", error: "Type your email address above first, then tap “Forgot password?”." });
    setReset({ sending: true, message: "", error: "" });
    try {
      await requestPasswordReset(email);
      setReset({ sending: false, message: "If that email has a Sokodigi account, we've sent a link to reset your password.", error: "" });
    } catch (e) { setReset({ sending: false, message: "", error: friendlyError(e) }); }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your Sokodigi account" onClose={onClose}>
      {authError && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{authError}</p>}
      {reset.error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{reset.error}</p>}
      {reset.message && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{reset.message}</p>}

      <form onSubmit={handleLogin} noValidate className="space-y-4">
        <AuthField label="Email address" type="email" inputMode="email" autoComplete="email" enterKeyHint="next" error={errors.email?.message} {...register("email")} />
        <AuthField label="Password" type="password" autoComplete="current-password" enterKeyHint="go" error={errors.password?.message} {...register("password")} />

        <div className="flex items-center justify-between gap-3">
          <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-slate-700">
            <input type="checkbox" className="h-5 w-5 accent-emerald-700" {...register("rememberMe")} /> Remember me
          </label>
          <button type="button" onClick={forgot} disabled={reset.sending || loading} className="min-h-10 text-xs font-bold text-emerald-700 underline disabled:opacity-50">
            {reset.sending ? "Sending…" : "Forgot password?"}
          </button>
        </div>

        <button type="submit" disabled={loading} className="min-h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60">
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <div className="border-t border-slate-100 pt-4 text-center">
          <p className="mb-2 text-xs text-slate-500">New to Sokodigi?</p>
          {onToggleMode ? (
            <button type="button" onClick={onToggleMode} className="min-h-12 w-full rounded-xl border border-emerald-800/20 text-sm font-bold text-emerald-900 hover:bg-emerald-50">Create a free account</button>
          ) : (
            <Link to={ROUTES.REGISTER} className="flex min-h-12 w-full items-center justify-center rounded-xl border border-emerald-800/20 text-sm font-bold text-emerald-900 hover:bg-emerald-50">Create a free account</Link>
          )}
        </div>
      </form>
    </AuthShell>
  );
}

export default LoginForm;
