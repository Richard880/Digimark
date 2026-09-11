import { useState } from "react";
import RegisterForm from "./components/RegisterForm/RegisterForm";
import LoginForm from "./components/LoginForm/LoginForm";

export default function AuthModal({ isOpen, onClose }) {
  // Manage view state locally inside the modal container wrapper
  const [isRegisterMode, setIsRegisterMode] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
      {/* Click outside to close overlay */}
      <div className="absolute inset-0" onClick={onClose} />
      
      {/* Modal Card Frame Body */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl overflow-hidden z-10 transition-all duration-300 border border-slate-100">
        
        {isRegisterMode ? (
          <RegisterForm 
            onToggleMode={() => setIsRegisterMode(false)} 
            onClose={onClose} 
          />
        ) : (
          <LoginForm 
            onToggleMode={() => setIsRegisterMode(true)} 
            onClose={onClose} 
          />
        )}

        {/* Universal Escape Cross Dismiss Button */}
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-light z-50 w-8 h-8 flex items-center justify-center bg-white/80 hover:bg-white rounded-full shadow-sm transition-all"
          aria-label="Dismiss form overlay"
        >
          &times;
        </button>
      </div>
    </div>
  );
}
