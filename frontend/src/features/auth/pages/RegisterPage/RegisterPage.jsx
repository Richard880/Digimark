import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "../../components/AuthCard";
import RegisterForm from "../../components/RegisterForm";
import MarketerSetup from "../../components/MarketerSetup/MarketerSetup";
import ROUTES from "../../../../constants/routes";
import "./registerPage.css";

const SPONSOR_RE = /^[a-zA-Z0-9_]{3,20}$/;

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("register"); // "register" | "marketer"

  // Referral links look like /register?sponsor=<username>. Remember the sponsor for the marketer step.
  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("sponsor");
    if (s && SPONSOR_RE.test(s)) sessionStorage.setItem("sokodigi_sponsor", s.toLowerCase());
  }, []);

  return (
    <AuthCard className="register-page">
      {step === "register" ? (
        <RegisterForm
          onRegistered={({ category }) =>
            category === "network" ? setStep("marketer") : navigate(ROUTES.HOME)
          }
        />
      ) : (
        <MarketerSetup onDone={() => navigate(ROUTES.MEMBERSHIP)} />
      )}
    </AuthCard>
  );
}

export default RegisterPage;
