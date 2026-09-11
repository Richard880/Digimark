import PropTypes from "prop-types";
import "./alert.css";

// Native SVG Icons replacing the "react-icons/fi" dependency
const icons = {
  success: (
    <svg xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
      <polyline points="22 4 12 14.01 9 11.01"></polyline>
    </svg>
  ),
  error: (
    <svg xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  warning: (
    <svg xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
      <line x1="12" y1="9" x2="12" y2="13"></line>
      <line x1="12" y1="17" x2="12.01" y2="17"></line>
    </svg>
  ),
  info: (
    <svg xmlns="http://w3.org" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="16" x2="12" y2="12"></line>
      <line x1="12" y1="8" x2="12.01" y2="8"></line>
    </svg>
  ),
};

function Alert({
  variant = "info",
  title,
  children,
  dismissible = false,
  onClose,
  className = "",
}) {
  return (
    <div
      className={`wempa-alert wempa-alert-${variant} ${className}`}
      role="alert"
    >
      <div className="wempa-alert-icon">
        {icons[variant]}
      </div>

      <div className="wempa-alert-content">
        {title && (
          <h6 className="wempa-alert-title">
            {title}
          </h6>
        )}

        <div className="wempa-alert-message">
          {children}
        </div>
      </div>

      {dismissible && (
        <button
          type="button"
          className="wempa-alert-close"
          aria-label="Close alert"
          onClick={onClose}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {/* Inline close cross icon snippet replacing <FiX /> */}
          <svg xmlns="http://w3.org" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}
    </div>
  );
}

Alert.propTypes = {
  variant: PropTypes.oneOf([
    "success",
    "error",
    "warning",
    "info",
  ]),
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
  dismissible: PropTypes.bool,
  onClose: PropTypes.func,
  className: PropTypes.string,
};

export default Alert;
