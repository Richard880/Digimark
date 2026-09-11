import PropTypes from "prop-types";

import styles from "./FormGrid.module.css";

function FormGrid({ children }) {
  return (
    <div className={styles.grid}>
      {children}
    </div>
  );
}

FormGrid.propTypes = {
  children: PropTypes.node.isRequired,
};

export default FormGrid;