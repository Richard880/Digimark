import {
  forwardRef,
  useEffect,
  useRef,
} from "react";
import PropTypes from "prop-types";
import "./checkbox.css";

import FormFieldError from "../FormFieldError";

const Checkbox = forwardRef(
  (
    {
      label,
      helperText,
      error,
      required = false,
      indeterminate = false,
      className = "",
      id,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef(null);

    const checkboxRef = ref || internalRef;

    useEffect(() => {
      if (checkboxRef.current) {
        checkboxRef.current.indeterminate = indeterminate;
      }
    }, [checkboxRef, indeterminate]);

    const inputId = id || props.name;
    const helperId = `${inputId}-helper`;

    return (
      <div className={`wempa-checkbox-group ${className}`}>
        <div className="wempa-checkbox-wrapper">
          <input
            ref={checkboxRef}
            id={inputId}
            type="checkbox"
            className="wempa-checkbox"
            aria-invalid={!!error}
            aria-required={required}
            aria-describedby={helperId}
            {...props}
          />

          {label && (
            <label
              htmlFor={inputId}
              className="wempa-checkbox-label"
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

Checkbox.displayName = "Checkbox";

Checkbox.propTypes = {
  label: PropTypes.string,
  helperText: PropTypes.string,
  error: PropTypes.string,
  required: PropTypes.bool,
  indeterminate: PropTypes.bool,
  className: PropTypes.string,
  id: PropTypes.string,
};

export default Checkbox;