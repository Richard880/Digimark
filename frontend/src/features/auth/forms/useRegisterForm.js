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
      accountCategory: "retail", // 🎯 NEW: Set default category track baseline (Retail)
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
      // 🛡️ SECURITY CLEANUP: Sanitize inputs and completely strip out sponsorIds for non-network users
      const submissionPayload = {
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        email: data.email.trim().toLowerCase(),
        phoneNumber: data.phoneNumber.trim(),
        password: data.password,
        accountCategory: data.accountCategory, // 🎯 NEW: Safely pass the track assignment down
        sponsorId: data.accountCategory === "network" && data.sponsorId ? data.sponsorId.trim() : "",
      };

      // Submit data vectors securely over the Firebase auth pipeline channel
      await registerUser(submissionPayload);

      console.log("🟢 Account successfully initialized on Firebase Nodes.");

      // OVERRIDE REDIRECTION TARGET USING THE UNIFIED CONSTANT
      // Pushing users straight into your new myShop Pro panel
      navigate(ROUTES.MEMBER_DASHBOARD, { replace: true });
      
    } catch (error) {
      setAuthError(error.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  };

  return {
    ...form,
    loading,
    authError,
    handleRegister: form.handleSubmit(onSubmit),
  };
}
