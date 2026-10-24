import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import RegisterForm from "./components/RegisterForm/RegisterForm";
import LoginForm from "./components/LoginForm/LoginForm";
import ROUTES from "../../constants/routes";

export default function AuthModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRegistered = ({ category }) => {
    onClose();
    // Marketers still need the brand-details step
    navigate(category === "network" ? ROUTES.BECOME_MARKETER : ROUTES.HOME);
  };

  return (
    <div className="fixed inset-0 z-[2000] overflow-y-auto bg-slate-900/60 backdrop-blur-sm sm:flex sm:justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={isRegisterMode ? "Create account" : "Sign in"}
        className="relative w-full min-h-full overflow-hidden bg-white sm:my-auto sm:min-h-0 sm:max-w-4xl sm:rounded-3xl sm:shadow-2xl">
        {isRegisterMode ? (
          <RegisterForm onToggleMode={() => setIsRegisterMode(false)} onClose={onClose} onRegistered={handleRegistered} />
        ) : (
          <LoginForm onToggleMode={() => setIsRegisterMode(true)} onClose={onClose} />
        )}
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-xl text-slate-600 shadow hover:bg-white">
          &times;
        </button>
      </div>
    </div>
  );
}
