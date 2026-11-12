import type { DraftCheck } from "../../../application/details/number-draft";

/** What a number field commits: its checked draft, and where it goes. */
export interface CommitNumberInput {
  /** The saved number, as the field shows it. */
  readonly saved: number;
  /** The draft, checked. */
  readonly check: DraftCheck<number>;
  /** Saves a passing number that differs from the saved one. */
  readonly save: (value: number) => void;
  /** Says a failing draft's message politely. */
  readonly announce: (message: string) => void;
  /** Puts back the saved number. */
  readonly reset: () => void;
}

/**
 * Saves the number if the draft passes and differs; announces its message
 * if it fails. The same number, such as "45.0" for 45, saves nothing and
 * shows the saved number.
 */
export function commitNumber(input: CommitNumberInput): void {
  const { check, saved, save, announce, reset } = input;
  if (check.status === "fails") {
    announce(check.message);
    return;
  }
  if (check.value === saved) {
    reset();
    return;
  }
  save(check.value);
}
