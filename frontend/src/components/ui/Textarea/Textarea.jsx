import { forwardRef } from "react";
// import PropTypes from "prop-types";
import FormFieldError from "../FormFieldError";
import styles from "./Textarea.module.css";

const Textarea = forwardRef(({ label, error, helperText, required, id, ...props }, ref) => {
  const inputId = id || props.name;
  const helperId = `${inputId}-helper`;

  return (
    <div className={styles.textareaGroup}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label} {required && <span className="required">*</span>}
        </label>
      )}
      <textarea
        ref={ref} // Pass the ref from register here
        id={inputId}
        className={`${styles.textarea} ${error ? styles.error : ""}`}
        aria-describedby={helperText ? helperId : undefined}
        {...props}
      />
      {error ? <FormFieldError message={error} /> : helperText && <small id={helperId}>{helperText}</small>}
    </div>
  );
});

Textarea.displayName = "Textarea";
export default Textarea;
