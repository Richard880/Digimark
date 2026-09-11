import { forwardRef, useState } from "react";
import PropTypes from "prop-types";
import { FiEye, FiEyeOff, FiLock } from "react-icons/fi";
import "./passwordInput.css";

import FormFieldError from "../FormFieldError";

const PasswordInput = forwardRef(
  (
    {
      label,
      error,
      helperText,
      required = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const [showPassword, setShowPassword] = useState(false);

    const inputId = id || props.name;
    const helperId = `${inputId}-helper`;

    const togglePassword = () => {
      setShowPassword((prev) => !prev);
    };

    return (
      <div className="wempa-input-group">
        {label && (
          <label
            htmlFor={inputId}
            className="wempa-input-label"
          >
            {label}

            {required && (
              <span
                className="required"
                aria-hidden="true"
              >
                *
              </span>
            )}
          </label>
        )}

        <div
          className={`wempa-password-wrapper ${
            error ? "error" : ""
          } ${className}`}
        >
          <span
            className="wempa-password-icon"
            aria-hidden="true"
          >
            <FiLock />
          </span>

          <input
            ref={ref}
            id={inputId}
            type={showPassword ? "text" : "password"}
            className="wempa-password-input"
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={helperId}
            {...props}
          />

          <button
            type="button"
            className="toggle-password"
            onClick={togglePassword}
            aria-label={
              showPassword ? "Hide password" : "Show password"
            }
            aria-pressed={showPassword}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
        </div>

        {error ? (
         <FormFieldError message={error} />
        ) : (
          helperText && (
            <small
              id={helperId}
              className="wempa-input-helper"
            >
              {helperText}
            </small>
          )
        )}
      </div>
    );
  }
);

PasswordInput.displayName = "PasswordInput";

PasswordInput.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string,
};

export default PasswordInput;