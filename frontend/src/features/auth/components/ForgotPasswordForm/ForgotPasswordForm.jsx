import { Link } from "react-router-dom";

import Card from "../../../../components/ui/Card";
import Input from "../../../../components/ui/Input";
import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";

import useForgotPasswordForm from "../../forms/useForgotPasswordForm";

import "./forgotPasswordForm.css";

function ForgotPasswordForm() {
  const {
    register,
    loading,
    authError,
    success,
    handleSubmitForm,
    formState: { errors },
  } = useForgotPasswordForm();

  return (
    <Card
      title="Forgot Password"
      subtitle="Enter your email address and we'll send you a password reset link."
      className="forgot-password-card"
    >
      {authError && (
        <Alert variant="error">
          {authError}
        </Alert>
      )}

      {success && (
        <Alert variant="success">
          Password reset email sent successfully.
          Please check your inbox.
        </Alert>
      )}

      <form
        onSubmit={handleSubmitForm}
        noValidate
        className="forgot-password-form"
      >
        <Input
          label="Email Address"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          error={errors.email?.message}
          {...register("email")}
        />

        <Button
          type="submit"
          loading={loading}
          className="forgot-password-button"
        >
          Send Reset Link
        </Button>

        <div className="forgot-password-footer">
          <Link to="/login">
            Back to Login
          </Link>
        </div>
      </form>
    </Card>
  );
}

export default ForgotPasswordForm;