import { forwardRef } from "react";
import PropTypes from "prop-types";
import "./Button.module.css";

 import Spinner from "../Spinner";

const Button = forwardRef(
  (
    {
      children,
      variant = "primary",
      type = "button",
      loading = false,
      disabled = false,
      icon = null,
      className = "",
      onClick,
      ...props
    },
    ref
  ) => {
    const isDisabled = loading || disabled;

    return (
      <button
        ref={ref}
        type={type}
        onClick={onClick}
        disabled={isDisabled}
        aria-disabled={isDisabled}
        aria-busy={loading}
        className={`wempa-btn wempa-btn-${variant} ${className}`.trim()}
        {...props}
      >
        {loading ? (
          <>
            <span
              className="wempa-spinner"
              aria-hidden="true"
            ></span>

   <span className="wempa-btn-loading">
    <Spinner size="sm" variant="light" />
    <span>Loading...</span>
</span>
          </>
        ) : (
          <>
            {icon && (
              <span
                className="wempa-btn-icon"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}

            <span>{children}</span>
          </>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf([
    "primary",
    "secondary",
    "success",
    "danger",
    "warning",
    "info",
    "light",
    "dark",
    "outline-primary",
    "outline-secondary",
  ]),
  type: PropTypes.oneOf(["button", "submit", "reset"]),
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  icon: PropTypes.node,
  className: PropTypes.string,
  onClick: PropTypes.func,
};

export default Button;