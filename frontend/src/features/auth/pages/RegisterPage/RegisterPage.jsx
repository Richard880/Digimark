import { useState } from "react";
import { useNavigate } from "react-router-dom";
import RegisterForm from "../../components/RegisterForm/RegisterForm";
import MarketerSetup from "../../components/MarketerSetup/MarketerSetup";
import ROUTES from "../../../../constants/routes";

function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState("register"); // "register" | "marketer"
  // The referral link (?sponsor=) is captured by MainLayout and kept for 30 days

  return (
    <div className="bg-slate-50 sm:px-4 sm:py-6">
      <div className="mx-auto w-full overflow-hidden bg-white sm:max-w-4xl sm:rounded-3xl sm:shadow-xl">
        {step === "register" ? (
          <RegisterForm onRegistered={({ category }) => (category === "network" ? setStep("marketer") : navigate(ROUTES.HOME))} />
        ) : (
          <MarketerSetup onDone={() => navigate(ROUTES.MEMBERSHIP)} />
        )}
      </div>
    </div>
  );
}

export default RegisterPage;
