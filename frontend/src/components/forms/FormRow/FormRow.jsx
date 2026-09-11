import PropTypes from "prop-types";

import styles from "./FormRow.module.css";

function FormRow({
  children,
  fullWidth = false,
}) {
  return (
    <div
      className={`${styles.row} ${
        fullWidth
          ? styles.fullWidth
          : ""
      }`}
    >
      {children}
    </div>
  );
}

FormRow.propTypes = {
  children: PropTypes.node.isRequired,
  fullWidth: PropTypes.bool,
};

export default FormRow;