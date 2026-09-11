import { useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth  from "../hooks/useAuth";
// Imported both utilities correctly
import { sendEmailVerification, reload } from "firebase/auth"; 
import getDefaultRouteByRole from "../../../utils/getDefaultRouteByRole";

export default function useVerifyEmail() {
  const navigate = useNavigate();
  const { auth, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  // 1. Resend Verification Function (Fully restored)
  const resendVerification = async () => {
    try {
      setLoading(true);
      setMessage("");

      const user = auth.currentUser;
      if (!user) {
        throw new Error("No authenticated user.");
      }

      await sendEmailVerification(user);
      setSuccess(true);
      setMessage("A new verification email has been sent.");
    } catch (error) {
      setSuccess(false);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Check Verification Function (With critical reload fix)
  const checkVerification = async () => {
    try {
      setLoading(true);
      setMessage("");

      const user = auth.currentUser;
      if (!user) {
        throw new Error("No authenticated user.");
      }

      // Force Firebase to pull the latest verification status from the server
      await reload(user); 

      // Now call your profile backend refresher
      const profile = await refreshProfile(user.uid, true);

      // Check the updated local user object status
      if (!user.emailVerified) {
        setSuccess(false);
        setMessage("Your email has not been verified yet.");
        return;
      }

      // Success! Route them forward
      navigate(getDefaultRouteByRole(profile?.role));
    } catch (error) {
      setSuccess(false);
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    success,
    message,
    resendVerification,
    checkVerification,
  };
}
