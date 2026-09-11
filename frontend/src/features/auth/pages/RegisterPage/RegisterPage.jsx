// src/features/auth/pages/RegisterPage/RegisterPage.jsx
import AuthCard from "../../components/AuthCard";
import RegisterForm from "../../components/RegisterForm";
import "./registerPage.css";

function RegisterPage() {
  return (
    <AuthCard className="register-page">
      <RegisterForm />
    </AuthCard>
  );
}

export default RegisterPage;
