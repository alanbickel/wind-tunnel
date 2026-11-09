import { useId } from "react";
import fieldStyles from "./Fields.module.css";

/** One choice of a picker: what it sets, and what it's called. */
export interface PickerOption {
  readonly value: string;
  readonly text: string;
}

export interface PickerProps {
  readonly label: string;
  /** The option shown while nothing is chosen. */
  readonly prompt: string;
  readonly value: string | undefined;
  readonly options: readonly PickerOption[];
  readonly onPick: (value: string) => void;
}

/** A labeled picker, empty until something is chosen. */
export function Picker({ label, prompt, value, options, onPick }: PickerProps) {
  const id = useId();
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(event) => {
          onPick(event.target.value);
        }}
      >
        <option value="" disabled>
          {prompt}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </div>
  );
}
