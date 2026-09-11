import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import forgotPasswordSchema from "../validation/forgotPasswordSchema";
import authService from "../services/authService";

export default function useForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [success, setSuccess] = useState(false);

  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async ({ email }) => {
    try {
      setLoading(true);
      setAuthError("");
      setSuccess(false);

      await authService.resetPassword(email);

      setSuccess(true);
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    ...form,

    loading,
    authError,
    success,

    handleSubmitForm: form.handleSubmit(onSubmit),
  };
}