import PropTypes from "prop-types";
import "./spinner.css";

function Spinner({
  size = "md",
  variant = "primary",
  label = "Loading...",
  className = "",
}) {
  return (
    <span
      className={`wempa-spinner wempa-spinner-${size} wempa-spinner-${variant} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="wempa-spinner-circle" aria-hidden="true"></span>
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

Spinner.propTypes = {
  size: PropTypes.oneOf(["sm", "md", "lg"]),
  variant: PropTypes.oneOf([
    "primary",
    "secondary",
    "light",
    "dark",
    "success",
    "danger",
    "warning",
    "info",
  ]),
  label: PropTypes.string,
  className: PropTypes.string,
};

export default Spinner;