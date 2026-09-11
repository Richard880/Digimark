import PropTypes from "prop-types";
import styles from "./ProgressBar.module.css";

function ProgressBar({
  value = 0,
  label,
  showValue = true,
  variant = "primary",
  size = "md",
  striped = false,
  animated = false,
  children,
  className = "",
}) {
  const progress = Math.min(
    100,
    Math.max(0, value)
  );

  const barClasses = [
    styles.bar,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    striped && styles.striped,
    animated && styles.animated,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`${styles.progressWrapper} ${className}`}
    >
      {(label || showValue) && (
        <div className={styles.header}>
          {label && (
            <span className={styles.label}>
              {label}
            </span>
          )}

          {showValue && (
            <span className={styles.value}>
              {progress}%
            </span>
          )}
        </div>
      )}

      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={barClasses}
          style={{
            width: `${progress}%`,
          }}
        />
      </div>

      {children && (
        <div className={styles.footer}>
          {children}
        </div>
      )}
    </div>
  );
}

ProgressBar.propTypes = {
  value: PropTypes.number,
  label: PropTypes.string,
  showValue: PropTypes.bool,
  variant: PropTypes.oneOf([
    "primary",
    "success",
    "warning",
    "danger",
    "info",
  ]),
  size: PropTypes.oneOf([
    "sm",
    "md",
    "lg",
  ]),
  striped: PropTypes.bool,
  animated: PropTypes.bool,
  children: PropTypes.node,
  className: PropTypes.string,
};

export default ProgressBar;