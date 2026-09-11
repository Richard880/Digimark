import Button from "../../../../components/ui/Button";
import Alert from "../../../../components/ui/Alert";

import useVerifyEmail from "../../forms/useVerifyEmail";

import "./verifyEmail.css";

function VerifyEmail() {
  const {
    loading,
    message,
    success,
    resendVerification,
    checkVerification,
  } = useVerifyEmail();

  return (
    <div className="verify-email-card">

      <div className="verify-email-icon">
        📧
      </div>

      <h1>Verify Your Email</h1>

      <p className="verify-email-description">
        We've sent a verification email to your inbox.
        Please click the verification link before
        continuing.
      </p>

      {message && (
        <Alert
          variant={success ? "success" : "info"}
        >
          {message}
        </Alert>
      )}

      <Button
        loading={loading}
        onClick={checkVerification}
      >
        I've Verified My Email
      </Button>

      <Button
        variant="secondary"
        loading={loading}
        onClick={resendVerification}
      >
        Resend Verification Email
      </Button>

    </div>
  );
}

export default VerifyEmail;