import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RegisterForm from "./components/RegisterForm/RegisterForm";
import LoginForm from "./components/LoginForm/LoginForm";
import ROUTES from "../../constants/routes";

export default function AuthModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  // Escape closes the modal, and the page behind stops scrolling while it is open
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRegistered = ({ category }) => {
    onClose();
    // Marketers still need the brand-details step, which lives on the register page
    navigate(category === "network" ? ROUTES.REGISTER : ROUTES.HOME);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div role="dialog" aria-modal="true" aria-label={isRegisterMode ? "Create account" : "Sign in"}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden z-10 border border-slate-100">
        {isRegisterMode ? (
          <RegisterForm onToggleMode={() => setIsRegisterMode(false)} onClose={onClose} onRegistered={handleRegistered} />
        ) : (
          <LoginForm onToggleMode={() => setIsRegisterMode(true)} onClose={onClose} />
        )}

        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-light z-50 w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow-sm transition-all">
          &times;
        </button>
      </div>
    </div>
  );
}
