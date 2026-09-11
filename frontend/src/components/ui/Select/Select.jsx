import PropTypes from "prop-types";

import "./select.css";

function Select({
  id,
  name,
  label,
  options = [],
  placeholder = "Select an option",
  error,
  disabled = false,
  className = "",
  ...props
}) {
  return (
    <div className={`wempa-select ${className}`}>
      {label && (
        <label
          htmlFor={id || name}
          className="wempa-select-label"
        >
          {label}
        </label>
      )}

      <select
        id={id || name}
        name={name}
        disabled={disabled}
        className={`wempa-select-control ${
          error ? "is-invalid" : ""
        }`}
        {...props}
      >
        <option value="">
          {placeholder}
        </option>

        {options.map((option) => {
          const value =
            typeof option === "string"
              ? option
              : option.value;

          const text =
            typeof option === "string"
              ? option
              : option.label;

          return (
            <option
              key={value}
              value={value}
            >
              {text}
            </option>
          );
        })}
      </select>

      {error && (
        <div className="wempa-select-error">
          {error.message}
        </div>
      )}
    </div>
  );
}

Select.propTypes = {
  id: PropTypes.string,

  name: PropTypes.string,

  label: PropTypes.string,

  options: PropTypes.array,

  placeholder: PropTypes.string,

  error: PropTypes.object,

  disabled: PropTypes.bool,

  className: PropTypes.string,
};

export default Select;