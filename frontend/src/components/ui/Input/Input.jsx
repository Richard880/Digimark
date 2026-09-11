import { forwardRef } from "react";
import PropTypes from "prop-types";
import "./input.css";

import FormFieldError from "../FormFieldError";

const Input = forwardRef(
  (
    {
      label,
      error,
      helperText,
      icon,
      required = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || props.name;
    const helperId = `${inputId}-helper`;

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
          className={`wempa-input-wrapper ${
            error ? "error" : ""
          } ${className}`}
        >
          {icon && (
            <span
              className="wempa-input-icon"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            className="wempa-input"
            aria-invalid={!!error}
            aria-required={required}
           aria-describedby={
  helperText ? helperId : undefined
}
            {...props}
          />
        </div>

      {error ? (
  <FormFieldError
      message={error}
  />
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

Input.displayName = "Input";

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  icon: PropTypes.node,
  required: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string,
};

export default Input;