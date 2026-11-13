import { useCallback, useRef, useState } from "react";
import type { Selection } from "../../application/details/selection";
import type { FindingKey } from "../../application/run-analysis/findings/finding";

/** The right column's tabs, in a wide window. */
export type SideTab = "details" | "run";

/**
 * What in Details takes the focus after a selection: its heading, or a new
 * component's name field, so the user can name it at once (UX §2.1 step 2).
 * "none" asks for nothing, for a selection that places the focus itself:
 * a step's remove moves it to the step's caller in the outline.
 */
export type FocusTarget = "heading" | "name" | "none";

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
   * Whether the wide layout's inspector is open, or collapsed to a strip
   * on the canvas's right edge. Selecting opens it.
   */
  readonly inspectorOpen: boolean;
  readonly showInspector: (open: boolean) => void;
  /**
   * Selects, and shows Details in an open inspector, whose `focus` takes the focus: its heading
   * unless given. Remembers the element that had the focus, such as the
   * button that made the selection, so `close` can return it.
   */
  readonly select: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects something Details shows, such as a step in a workflow's
   * outline, as `select` does, but keeps the element `close` returns the
   * focus to: the one that has it now is in Details, and goes with it.
   */
  readonly selectWithin: (selection: Selection, focus?: FocusTarget) => void;
  /**
   * Selects a finding of the run, which marks its component on the
   * diagram and nothing more: the tab stays, the focus stays on the
   * finding, and the opener isn't changed (UX design §5).
   */
  readonly selectFinding: (key: FindingKey) => void;
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
 * `reveal` shows an element that may have been hidden since it made the
 * selection, such as a button in a canvas panel closed since, so `close`
 * can return the focus to it.
 */
export function useSelection(reveal: RevealElement): ProjectSelection {
  const [selection, setSelection] = useState<Selection>();
  const [tab, showTab] = useState<SideTab>("run");
  const [inspectorOpen, showInspector] = useState(true);
  const { request, takeFocus } = useFocusRequest();

  const selectWithin = useCallback(
    (next: Selection, focus: FocusTarget = "heading") => {
      request(focus);
      setSelection(next);
      // A workload opens in the dock, so the inspector closes (UX §5).
      const opensInDock = next.kind === "workload";
      if (!opensInDock) showTab("details");
      showInspector(!opensInDock);
    },
    [request],
  );
  const clear = useCallback(() => {
    request(undefined);
    setSelection(undefined);
    showTab("run");
  }, [request]);
  const { select, close } = useOpener({ selectWithin, clear, reveal });
  const selectFinding = useFindingSelect({
    request,
    setSelection,
    showInspector,
  });

  const changes = { select, selectWithin, selectFinding, clear, close };
  const inspector = { inspectorOpen, showInspector };
  return { selection, tab, showTab, ...inspector, ...changes, takeFocus };
}

/** What selecting a finding changes. */
interface FindingSelectInput {
  readonly request: FocusRequest["request"];
  readonly setSelection: (selection: Selection) => void;
  readonly showInspector: (open: boolean) => void;
}

/**
 * Selects a finding: no focus is asked for and the tab stays, so only the
 * selection changes, and the inspector opens if it was closed.
 */
function useFindingSelect(
  input: FindingSelectInput,
): ProjectSelection["selectFinding"] {
  const { request, setSelection, showInspector } = input;
  return useCallback(
    (key: FindingKey) => {
      request(undefined);
      setSelection({ kind: "finding", key });
      showInspector(true);
    },
    [request, setSelection, showInspector],
  );
}

/** Shows an element, if something has hidden it, so it can take the focus. */
export type RevealElement = (element: HTMLElement) => void;

/**
 * The changes the opener is remembered and returned around, and what
 * shows it again.
 */
interface OpenerInput extends Pick<ProjectSelection, "selectWithin" | "clear"> {
  readonly reveal: RevealElement;
}

/**
 * `select`, which remembers the element that had the focus, and `close`,
 * which shows it again if it's been hidden since, and returns the focus
 * to it.
 */
function useOpener({
  selectWithin,
  clear,
  reveal,
}: OpenerInput): Pick<ProjectSelection, "select" | "close"> {
  const opener = useRef<HTMLElement | null>(null);
  const select = useCallback(
    (next: Selection, focus?: FocusTarget) => {
      opener.current = focusedElement();
      selectWithin(next, focus);
    },
    [selectWithin],
  );
  const close = useCallback(() => {
    const element = opener.current;
    opener.current = null;
    clear();
    if (!element?.isConnected) return;
    reveal(element);
    element.focus();
  }, [clear, reveal]);
  return { select, close };
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
