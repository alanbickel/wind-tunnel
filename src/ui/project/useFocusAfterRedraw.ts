import { useCallback, useLayoutEffect, useRef, type RefCallback } from "react";

/** A ref for a step's button, which the outline remembers by the step's id. */
export type StepButtonRefs = (stepId: string) => RefCallback<HTMLButtonElement>;

export interface FocusAfterRedraw {
  /** Gives a step's button a ref, so it can be found. */
  readonly buttons: StepButtonRefs;
  /** Asks for a step's button to take the focus once the outline has drawn again. */
  readonly after: (stepId: string) => void;
}

/**
 * Puts the focus on a step's button after the outline redraws: a remove
 * takes the button that had the focus away, and the focus goes to the
 * step's caller. (A move needs nothing: React puts the focus back on an
 * element it moved.) The buttons are found by the refs they were given, not
 * by the document, so a step's ID may hold any character.
 */
export function useFocusAfterRedraw(): FocusAfterRedraw {
  const found = useRef(new Map<string, HTMLButtonElement>());
  const pending = useRef<string>(undefined);
  useLayoutEffect(() => {
    const wanted = pending.current;
    pending.current = undefined;
    if (wanted !== undefined) found.current.get(wanted)?.focus();
  });
  const buttons = useCallback<StepButtonRefs>(
    (stepId) => (element) => {
      if (element === null) found.current.delete(stepId);
      else found.current.set(stepId, element);
    },
    [],
  );
  const after = useCallback((stepId: string) => {
    pending.current = stepId;
  }, []);
  return { buttons, after };
}
