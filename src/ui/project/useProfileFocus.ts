import { useCallback, useLayoutEffect, useRef, type RefCallback } from "react";

/** Where the focus goes after "Add point" or a remove has redrawn the table. */
export const ADD_POINT = Symbol("add-point");

/** A row, counting from 0, whose time field takes the focus; or `ADD_POINT`. */
export type ProfileFocusTarget = number | typeof ADD_POINT;

/** A ref for a row's time field, which the table remembers by its row. */
export type TimeRefs = (row: number) => RefCallback<HTMLInputElement>;

export interface ProfileFocus {
  /** Gives a row's time field a ref, so it can be found. */
  readonly times: TimeRefs;
  /** The "Add point" button's ref. */
  readonly addPoint: RefCallback<HTMLButtonElement>;
  /**
   * Asks for a row's time field, or `ADD_POINT`, to take the focus once the
   * table has drawn again. Call it only with an edit that changes the
   * profile: the request is kept until the next draw of the table, so an
   * edit that changes nothing would leave it to move the focus on some
   * later draw.
   */
  readonly after: (target: ProfileFocusTarget) => void;
}

/**
 * Puts the focus where an add, a move, or a remove leaves it: an added
 * point's time field, a moved point's time field in its new row, the time
 * field of the row that took a removed row's place, or "Add point" when the
 * last row went. A remove takes away the button that had the focus, and a
 * move draws the point in another row, so neither can leave it alone. The
 * rows are drawn by position, so a row's field is found by its position
 * after the redraw.
 */
export function useProfileFocus(): ProfileFocus {
  const timeFields = useRef(new Map<number, HTMLInputElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const pending = useRef<ProfileFocusTarget>(undefined);
  useLayoutEffect(() => {
    const wanted = pending.current;
    pending.current = undefined;
    if (wanted === undefined) return;
    const target =
      wanted === ADD_POINT ? addRef.current : timeFields.current.get(wanted);
    target?.focus();
  });
  const times = useCallback<TimeRefs>(
    (row) => (element) => {
      if (element === null) timeFields.current.delete(row);
      else timeFields.current.set(row, element);
    },
    [],
  );
  const addPoint = useCallback<RefCallback<HTMLButtonElement>>((element) => {
    addRef.current = element;
  }, []);
  const after = useCallback((target: ProfileFocusTarget) => {
    pending.current = target;
  }, []);
  return { times, addPoint, after };
}
