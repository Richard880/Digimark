import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "../../components/AuthCard";
import RegisterForm from "../../components/RegisterForm";
import MarketerSetup from "../../components/MarketerSetup/MarketerSetup";
import "./registerPage.css";
import ROUTES from "../../../../constants/routes";
// ...
navigate(ROUTES.HOME)        // buyers
navigate(ROUTES.MEMBERSHIP)  // marketers, after the brand setup step

// Map these to your real routes
const ROUTES = { home: "/", membership: "/membership" };

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("register");

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("sponsor");
    if (s && /^[a-zA-Z0-9_]{3,20}$/.test(s)) sessionStorage.setItem("sokodigi_sponsor", s.toLowerCase());
  }, []);

  return (
    <AuthCard className="register-page">
      {step === "register" ? (
        <RegisterForm
          onRegistered={({ category }) => (category === "network" ? setStep("marketer") : navigate(ROUTES.home))}
        />
      ) : (
        <MarketerSetup onDone={() => navigate(ROUTES.membership)} />
      )}
    </AuthCard>
  );
}

export default RegisterPage;
