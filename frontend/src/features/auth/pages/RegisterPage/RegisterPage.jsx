import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthCard from "../../components/AuthCard";
import RegisterForm from "../../components/RegisterForm";
import MarketerSetup from "../../components/MarketerSetup/MarketerSetup";
import ROUTES from "../../../../constants/routes";
import "./registerPage.css";



function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("register"); // "register" | "marketer"

  // Referral links look like /register?sponsor=<username>. Remember the sponsor for the marketer step.
 

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
