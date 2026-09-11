import PropTypes from "prop-types";

import "./formField.css";

function FormField({
  id,
  label,
  required = false,
  error,
  children,
  helperText,
  className = "",
}) {
  return (
    <div
      className={`wempa-form-field ${className}`}
    >
      {label && (
        <label
          htmlFor={id}
          className="wempa-form-field-label"
        >
          {label}

          {required && (
            <span
              className="wempa-form-field-required"
              aria-hidden="true"
            >
              *
            </span>
          )}
        </label>
      )}

      {children}

      {helperText && !error && (
        <small className="wempa-form-field-helper">
          {helperText}
        </small>
      )}

      {error && (
        <small
          className="wempa-form-field-error"
          role="alert"
        >
          {error.message}
        </small>
      )}
    </div>
  );
}

FormField.propTypes = {
  id: PropTypes.string,

  label: PropTypes.string,

  required: PropTypes.bool,

  helperText: PropTypes.string,

  error: PropTypes.object,

  className: PropTypes.string,

  children: PropTypes.node.isRequired,
};

export default FormField;