// src/features/auth/pages/LoginPage/LoginPage.jsx
import AuthCard from "../../components/AuthCard";
import LoginForm from "../../components/LoginForm";
import "./loginPage.css";

function LoginPage() {
  return (
    /* 	🏼 REMOVED TITLE & SUBTITLE SO AUTH-CARD BECOMES A PASSTHROUGH WRAPPER */
    <AuthCard className="login-page">
      <LoginForm />
    </AuthCard>
  );
}

export default LoginPage;
