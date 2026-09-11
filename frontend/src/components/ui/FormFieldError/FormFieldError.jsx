import PropTypes from "prop-types";
import "./formFieldError.css";

function FormFieldError({
  message,
  variant = "error",
  className = "",
}) {
  if (!message) return null;

  return (
    <small
      className={`wempa-form-feedback wempa-form-feedback-${variant} ${className}`}
      role={variant === "error" ? "alert" : "status"}
      aria-live={variant === "error" ? "assertive" : "polite"}
    >
      {message}
    </small>
  );
}

FormFieldError.propTypes = {
  message: PropTypes.string,
  variant: PropTypes.oneOf([
    "error",
    "success",
    "warning",
    "info",
  ]),
  className: PropTypes.string,
};

export default FormFieldError;