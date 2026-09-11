// src/components/forms/DynamicField/DynamicField.jsx

import PropTypes from "prop-types";
import Input from "../../ui/Input";
import Textarea from "../../ui/Textarea";
import Select from "../../ui/Select";
import styles from "./DynamicField.module.css";

function DynamicField({ field, register, errors }) {
  const error = errors?.[field.name]?.message;

  const commonProps = {
    label: field.label,
    placeholder: field.placeholder,
    required: field.required,
    error,
    disabled: field.disabled,
    readOnly: field.readOnly,
    autoComplete: field.autoComplete,
    maxLength: field.maxLength,
    minLength: field.minLength,
    helperText: field.helperText,
  };

  switch (field.type) {
    case "textarea":
      return (
        <div className={styles.field}>
          <Textarea
            {...commonProps}
            rows={field.rows ?? 4}
            {...register(field.name)}
          />
        </div>
      );

    case "select":
      return (
        <div className={styles.field}>
          <Select
            {...commonProps}
            options={field.options ?? []}
            {...register(field.name)}
          />
        </div>
      );

    case "date":
      return (
        <div className={styles.field}>
          <Input
            {...commonProps}
            type="date"
            {...register(field.name)}
          />
        </div>
      );

    default:
      return (
        <div className={styles.field}>
          <Input
            {...commonProps}
            type={field.type ?? "text"}
            accept={field.accept}
            multiple={field.multiple}
            {...register(field.name)}
          />
        </div>
      );
  }
}

DynamicField.propTypes = {
  field: PropTypes.shape({
    name: PropTypes.string.isRequired,
    label: PropTypes.string,
    type: PropTypes.string,
    placeholder: PropTypes.string,
    required: PropTypes.bool,
    disabled: PropTypes.bool,
    readOnly: PropTypes.bool,
    autoComplete: PropTypes.string,
    maxLength: PropTypes.number,
    minLength: PropTypes.number,
    helperText: PropTypes.string,
    options: PropTypes.array,
    rows: PropTypes.number,
    accept: PropTypes.string,
    multiple: PropTypes.bool,
  }).isRequired,

  register: PropTypes.func.isRequired,
  errors: PropTypes.object,
};

export default DynamicField;
