import { useId } from "react";
import type { ChoiceFieldDescriptor } from "../../../application/details/field-descriptor";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";

export interface ChoiceFieldProps extends FieldProps {
  readonly field: ChoiceFieldDescriptor;
  /** As stored: one of the options' values. */
  readonly value: unknown;
  /** The id of the setting's help, which also describes the field. */
  readonly helpId: string;
}

/**
 * A choice setting: a picker that lists its options by label and saves the
 * picked option's value. Every option passes the schema, so a pick saves at
 * once, with no draft to check.
 */
export function ChoiceField({ field, value, helpId, save }: ChoiceFieldProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {field.label}
      </label>
      <select
        id={id}
        value={String(value)}
        aria-describedby={helpId}
        onChange={(event) => {
          const picked = field.options.find(
            (option) => option.value === event.target.value,
          );
          if (picked !== undefined && picked.value !== value)
            save(picked.value);
        }}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
