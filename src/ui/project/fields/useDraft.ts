import { useState } from "react";
import { sameContent } from "../../../application/run-analysis/same-content";

/** What's typed into a field, until it becomes a command or is put back. */
export interface Draft<T> {
  readonly value: T;
  readonly set: (value: T) => void;
  /** Puts back the saved value. */
  readonly reset: () => void;
  /** True while the draft differs from the saved value. */
  readonly changed: boolean;
}

/** The saved value a draft started from, and the draft. */
interface DraftState<T> {
  readonly saved: T;
  readonly value: T;
}

/**
 * A field's draft (UX design §4.3): starts as the saved value, holds what's
 * typed, and starts again whenever the saved value changes, such as after
 * the draft's own command saves, or a reset to the default. Compared by
 * content, so a saved value rebuilt on each render doesn't reset it.
 */
export function useDraft<T>(saved: T): Draft<T> {
  const [state, setState] = useState<DraftState<T>>({ saved, value: saved });
  // React's "adjusting state when a prop changes" pattern: set during
  // render, so the field never shows a stale draft for a frame.
  const current = sameContent(state.saved, saved)
    ? state
    : { saved, value: saved };
  if (current !== state) setState(current);
  return {
    value: current.value,
    set: (value) => {
      setState({ saved, value });
    },
    reset: () => {
      setState({ saved, value: saved });
    },
    changed: !sameContent(current.value, saved),
  };
}
