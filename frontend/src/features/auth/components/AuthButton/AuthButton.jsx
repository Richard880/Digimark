
import PropTypes from 'prop-types';
import styles from './AuthButton.module.css';

export const AuthButton = ({ 
  type = 'submit', 
  isLoading = false, 
  disabled = false, 
  children, 
  ...rest 
}) => {
  return (
    <button
      type={type}
      className={styles.button}
      disabled={disabled || isLoading}
      {...rest}
    >
      {isLoading && <span className={styles.spinner} role="status" aria-hidden="true" />}
      {children}
    </button>
  );
};

AuthButton.propTypes = {
  type: PropTypes.oneOf(['submit', 'button', 'reset']),
  isLoading: PropTypes.bool,
  disabled: PropTypes.bool,
  children: PropTypes.node.isRequired,
};
