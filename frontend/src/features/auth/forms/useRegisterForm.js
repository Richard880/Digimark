import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "react-router-dom";

import registerSchema from "../validation/registerSchema";
import useAuth from "../hooks/useAuth";
import ROUTES from "../../../constants/routes";

export default function useRegisterForm() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");

  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      password: "",
      confirmPassword: "",
      sponsorId: "", 
      acceptTerms: false,
    },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const onSubmit = async (data) => {
    setAuthError("");
    setLoading(true);

      try {
      // 1. Submit data vectors securely over the Firebase auth pipeline channel
      await registerUser({
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phoneNumber: data.phoneNumber.trim(),
        password: data.password,
        sponsorId: data.sponsorId ? data.sponsorId.trim() : "",
      });

      console.log("🟢 Account successfully initialized on Firebase Nodes.");

      // 2. 🎯 OVERRIDE REDIRECTION TARGET USING THE UNIFIED CONSTANT
      // Swapping out verification routes to push users straight into your new myShop Pro panel
      navigate(ROUTES.MEMBER_DASHBOARD, { replace: true });
      
    } catch (error) {
      setAuthError(error.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  }

  return {
    ...form,
    loading,
    authError,
    handleRegister: form.handleSubmit(onSubmit),
  };
}
