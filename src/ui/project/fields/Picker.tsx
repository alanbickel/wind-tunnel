import { useId, type Ref } from "react";
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
  /** The `<select>`, for a screen that moves the focus to it. */
  readonly selectRef?: Ref<HTMLSelectElement>;
  /**
   * False when the picker can't change: it stays focusable, as a Button
   * does, and `explanation` says why. Defaults to true.
   */
  readonly usable?: boolean;
  /** Why a picker that isn't usable is; read as its description. */
  readonly explanation?: string;
}

interface PickerOptionsProps {
  readonly prompt: string;
  readonly options: readonly PickerOption[];
}

/** The prompt, which can't be chosen, then each option. */
function PickerOptions({ prompt, options }: PickerOptionsProps) {
  return (
    <>
      <option value="" disabled>
        {prompt}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.text}
        </option>
      ))}
    </>
  );
}

/**
 * A labeled picker, empty until something is chosen, and empty again if
 * its value isn't among its options.
 */
export function Picker(props: PickerProps) {
  const { label, prompt, value, options, onPick, selectRef } = props;
  const { usable = true, explanation } = props;
  const id = useId();
  const explanationId = useId();
  return (
    <div className={fieldStyles.field}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <select
        ref={selectRef}
        id={id}
        value={options.some((o) => o.value === value) ? value : ""}
        aria-disabled={usable ? undefined : true}
        aria-describedby={usable ? undefined : explanationId}
        onChange={(event) => {
          if (usable) onPick(event.target.value);
        }}
      >
        <PickerOptions prompt={prompt} options={options} />
      </select>
      {!usable && <p id={explanationId}>{explanation}</p>}
    </div>
  );
}
