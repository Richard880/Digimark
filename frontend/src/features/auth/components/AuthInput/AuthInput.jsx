
import { forwardRef, useId } from "react";
import PropTypes from "prop-types";
import styles from "./AuthInput.module.css";

export const AuthInput = forwardRef(
  (
    {
      label,
      id,
      type = "text",
      error,
      icon,
      className = "",
      ...rest
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || generatedId;
    const hasError = Boolean(error);

    return (
      <div className={`${styles.container} ${className}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}

        <div
          className={`${styles.inputWrapper} ${
            icon ? styles.hasIcon : ""
          }`}
        >
          {icon && (
            <i
              className={`bi bi-${icon} ${styles.inputIcon}`}
              aria-hidden="true"
            />
          )}

          <input
            ref={ref}
            id={inputId}
            type={type}
            className={`${styles.input} ${
              hasError ? styles.inputError : ""
            } ${icon ? styles.padLeft : ""}`}
            aria-invalid={hasError ? "true" : "false"}
            aria-describedby={
              hasError ? `${inputId}-error` : undefined
            }
            {...rest}
          />
        </div>

        {hasError && (
          <span
            id={`${inputId}-error`}
            className={styles.feedback}
            role="alert"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);

AuthInput.displayName = "AuthInput";

AuthInput.propTypes = {
  label: PropTypes.string,
  id: PropTypes.string,
  type: PropTypes.string,
  error: PropTypes.string,
  icon: PropTypes.string,
  className: PropTypes.string,
};


