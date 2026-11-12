import type { FindingKey } from "../../application/run-analysis/findings/finding";

/**
 * Selecting a finding in the run's results (UX design §5). The screen
 * holds the selection; the findings only show it and ask to change it.
 */
export interface FindingSelecting {
  /** The selected finding, if one is. */
  readonly selected: FindingKey | undefined;
  readonly onSelect: (key: FindingKey) => void;
  /** Clears the selection, as Escape does, leaving the focus where it is. */
  readonly onClear: () => void;
  /**
   * Whether the finding's component has gone from the project since the
   * run: the finding is worded from the run's copy (ADR-0018).
   */
  readonly isGone: (key: FindingKey) => boolean;
}
