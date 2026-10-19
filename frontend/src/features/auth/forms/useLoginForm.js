import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import loginSchema from "../validation/loginSchema";
import useAuth from "../hooks/useAuth";
import { friendlyError } from "../authApi";
import ROUTES from "../../../constants/routes";
import ROLES from "../../../constants/roles";

// auth.destination comes from the provider (see destinationFor in authApi.js)
const DESTINATIONS = {
  home: ROUTES.HOME,
  membership: ROUTES.MEMBERSHIP || "/membership", // pending or lapsed marketers: pay or renew
  dashboard: ROUTES.MEMBER_DASHBOARD,             // active marketers
  suspended: ROUTES.HOME,
};

export default function useLoginForm(onClose) {
  const { auth, login, logout } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  // Keep the latest onClose without making it an effect dependency
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  // Runs after a login, and also when a signed-in user lands on the login page
  useEffect(() => {
    if (auth.loading || !auth.authenticated) return;
    onCloseRef.current?.();

    if (auth.role === ROLES.SUPER_ADMIN || auth.role === ROLES.ADMIN) {
      navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
      return;
    }
    navigate(DESTINATIONS[auth.destination] || ROUTES.HOME, { replace: true });
  }, [auth.loading, auth.authenticated, auth.role, auth.destination, navigate]);

  const onSubmit = async (data) => {
    if (loading) return;
    setAuthError("");
    setLoading(true);
    try {
      await login({
        email: data.email.trim(),
        password: data.password,
        rememberMe: !!data.rememberMe,
      });
      // No navigate here: the effect above sends the user to the right place
    } catch (error) {
      if (error?.code === "ACCOUNT_DISABLED") await logout().catch(() => {});
      setAuthError(friendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return {
    ...form,
    loading,
    authError,
    handleLogin: form.handleSubmit(onSubmit),
  };
}
