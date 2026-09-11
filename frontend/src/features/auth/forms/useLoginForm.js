import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import loginSchema from "../validation/loginSchema";
import useAuth from "../hooks/useAuth";
import ROUTES from "../../../constants/routes";
import ROLES from "../../../constants/roles";

export default function useLoginForm(onClose) {
  const { auth, login } = useAuth();
  const navigate = useNavigate();
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "", rememberMe: false },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  useEffect(() => {
    if (auth.loading || !auth.authenticated || !auth.role) return;
    if (onClose) onClose();

    switch (auth.role) {
      case ROLES.SUPER_ADMIN:
      case ROLES.ADMIN:
        navigate(ROUTES.ADMIN_DASHBOARD, { replace: true });
        break;
      case ROLES.MEMBER:
        navigate(ROUTES.MEMBER_DASHBOARD, { replace: true });
        break;
      default:
        navigate(ROUTES.HOME, { replace: true });
    }
  }, [auth.loading, auth.authenticated, auth.role, navigate, onClose]);

  const onSubmit = async (data) => {
    setAuthError("");
    setLoading(true);
    try {
      await login({
        email: data.email.trim(),
        password: data.password,
        rememberMe: data.rememberMe,
      });
    } catch (error) {
      setAuthError(error.message || "Unable to sign in. Please verify your credentials.");
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
