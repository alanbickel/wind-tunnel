import { useCallback, useLayoutEffect, useRef, type RefCallback } from "react";

/** Where the focus goes after "Add to mix" or a remove has redrawn the mix. */
export const ADD_TO_MIX = Symbol("add-to-mix");

/** A row's key, or `ADD_TO_MIX`. */
export type MixFocusTarget = string | typeof ADD_TO_MIX;

/** A ref for a row's weight field, which the mix remembers by the row's key. */
export type WeightRefs = (rowKey: string) => RefCallback<HTMLInputElement>;

export interface MixFocus {
  /** Gives a row's weight field a ref, so it can be found. */
  readonly weights: WeightRefs;
  /** The "Add to mix" picker's ref. */
  readonly picker: RefCallback<HTMLSelectElement>;
  /**
   * Asks for a row's weight field, or `ADD_TO_MIX`, to take the focus once
   * the mix has drawn again. Call it only with an edit that changes the mix:
   * the request is kept until the next draw of the mix, so an edit that
   * changes nothing would leave it to move the focus on some later draw.
   */
  readonly after: (target: MixFocusTarget) => void;
}

/**
 * Puts the focus where an add or a remove leaves it: an added entry's
 * weight field, the weight field of the row that took a removed row's
 * place, or "Add to mix" when the last row went. A remove takes away the
 * button that had the focus, and an add draws a field that doesn't yet, so
 * neither can leave it alone. The elements are found by the refs they were
 * given, not by the document.
 */
export function useMixFocus(): MixFocus {
  const weightFields = useRef(new Map<string, HTMLInputElement>());
  const pickerRef = useRef<HTMLSelectElement>(null);
  const pending = useRef<MixFocusTarget>(undefined);
  useLayoutEffect(() => {
    const wanted = pending.current;
    pending.current = undefined;
    if (wanted === undefined) return;
    const target =
      wanted === ADD_TO_MIX
        ? pickerRef.current
        : weightFields.current.get(wanted);
    target?.focus();
  });
  const weights = useCallback<WeightRefs>(
    (rowKey) => (element) => {
      if (element === null) weightFields.current.delete(rowKey);
      else weightFields.current.set(rowKey, element);
    },
    [],
  );
  const picker = useCallback<RefCallback<HTMLSelectElement>>((element) => {
    pickerRef.current = element;
  }, []);
  const after = useCallback((target: MixFocusTarget) => {
    pending.current = target;
  }, []);
  return { weights, picker, after };
}
