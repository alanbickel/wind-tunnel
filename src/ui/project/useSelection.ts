import { useCallback, useRef, useState } from "react";
import type { Selection } from "../../application/details/selection";

/** The right column's tabs, in a wide window. */
export type SideTab = "details" | "run";

/** The project screen's one selection, and what selecting does to the screen. */
export interface ProjectSelection {
  readonly selection: Selection | undefined;
  /**
   * The wide layout's tab: Details once something is selected, Run once
   * it's cleared, and whichever the user picks in between.
   */
  readonly tab: SideTab;
  readonly showTab: (tab: SideTab) => void;
  /**
   * Selects, and shows Details. Remembers the element that had the focus,
   * such as the button that made the selection, so `close` can return it.
   */
  readonly select: (selection: Selection) => void;
  /** Clears the selection and shows Run, leaving the focus where it is. */
  readonly clear: () => void;
  /**
   * Whether Details should take the focus now: true once after each
   * `select`, then false. So Details mounting again, as it does when the
   * window crosses the breakpoint, leaves the focus where it is.
   */
  readonly takeFocus: () => boolean;
  /**
   * Clears the selection, shows Run, and returns the focus to the element
   * that had it when the selection was made, if it's still on the page.
   */
  readonly close: () => void;
}

/**
 * The selection a project screen holds above both columns (UX design
 * §4.1), so the diagram, its text version, and Details read the same one.
 * It lasts while the screen is open, and isn't saved with the project.
 */
export function useSelection(): ProjectSelection {
  const [selection, setSelection] = useState<Selection>();
  const [tab, showTab] = useState<SideTab>("run");
  const opener = useRef<HTMLElement | null>(null);
  const focusRequested = useRef(false);

  const select = useCallback((next: Selection) => {
    opener.current = focusedElement();
    focusRequested.current = true;
    setSelection(next);
    showTab("details");
  }, []);
  const clear = useCallback(() => {
    focusRequested.current = false;
    setSelection(undefined);
    showTab("run");
  }, []);
  const takeFocus = useCallback(() => {
    const requested = focusRequested.current;
    focusRequested.current = false;
    return requested;
  }, []);
  const close = useCallback(() => {
    const element = opener.current;
    opener.current = null;
    clear();
    if (element?.isConnected) element.focus();
  }, [clear]);

  return { selection, tab, showTab, select, clear, close, takeFocus };
}

function focusedElement(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement ? element : null;
}
