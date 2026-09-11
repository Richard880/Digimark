// src/components/forms/FormSection/FormSection.jsx

import PropTypes from "prop-types";
import styles from "./FormSection.module.css";

function FormSection({ title, description, children }) {
  return (
    <section className={styles.section}>
      {(title || description) && (
        <header className={styles.header}>
          {title && (
            <h2 className={styles.title}>
              {title}
            </h2>
          )}

          {description && (
            <p className={styles.description}>
              {description}
            </p>
          )}
        </header>
      )}

      <div className={styles.content}>
        {children}
      </div>
    </section>
  );
}

FormSection.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
  children: PropTypes.node.isRequired,
};

export default FormSection;
