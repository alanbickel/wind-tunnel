import { useCallback, useRef, useState } from "react";
import type { Selection } from "../../application/details/selection";

/** The right column's tabs, in a wide window. */
export type SideTab = "details" | "run";

/**
 * What in Details takes the focus after a selection: its heading, or a new
 * component's name field, so the user can name it at once (UX §2.1 step 2).
 */
export type FocusTarget = "heading" | "name";

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
   * Selects, and shows Details, whose `focus` takes the focus: its heading
   * unless given. Remembers the element that had the focus, such as the
   * button that made the selection, so `close` can return it.
   */
  readonly select: (selection: Selection, focus?: FocusTarget) => void;
  /** Clears the selection and shows Run, leaving the focus where it is. */
  readonly clear: () => void;
  /**
   * Whether `target` should take the focus now: true once after a
   * `select` that named it, then false. So Details mounting again, as it
   * does when the window crosses the breakpoint, leaves the focus where it
   * is.
   */
  readonly takeFocus: (target: FocusTarget) => boolean;
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
  const { request, takeFocus } = useFocusRequest();

  const select = useCallback(
    (next: Selection, focus: FocusTarget = "heading") => {
      opener.current = focusedElement();
      request(focus);
      setSelection(next);
      showTab("details");
    },
    [request],
  );
  const clear = useCallback(() => {
    request(undefined);
    setSelection(undefined);
    showTab("run");
  }, [request]);
  const close = useCallback(() => {
    const element = opener.current;
    opener.current = null;
    clear();
    if (element?.isConnected) element.focus();
  }, [clear]);

  return { selection, tab, showTab, select, clear, close, takeFocus };
}

/** Which part of Details should take the focus next, if any. */
interface FocusRequest {
  /** Asks for `target` to take the focus; undefined asks for none. */
  readonly request: (target: FocusTarget | undefined) => void;
  readonly takeFocus: ProjectSelection["takeFocus"];
}

/** A focus request, answered once, by the target it names. */
function useFocusRequest(): FocusRequest {
  const requested = useRef<FocusTarget>(undefined);
  const request = useCallback((target: FocusTarget | undefined) => {
    requested.current = target;
  }, []);
  const takeFocus = useCallback((target: FocusTarget) => {
    if (requested.current !== target) return false;
    requested.current = undefined;
    return true;
  }, []);
  return { request, takeFocus };
}

function focusedElement(): HTMLElement | null {
  const element = document.activeElement;
  return element instanceof HTMLElement ? element : null;
}
