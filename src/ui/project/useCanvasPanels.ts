import { useCallback, useMemo, useState } from "react";
import { flushSync } from "react-dom";

/**
 * The canvas's panels: the tool rail's four ("add" component's types,
 * "connect"'s hint, the "workflows" and the "workloads"), and the text
 * version at the bottom left.
 */
export type CanvasPanelId =
  "add" | "connect" | "workflows" | "workloads" | "text";

/**
 * The attribute each panel's section carries, holding its id, so `reveal`
 * can find the panel an element is in.
 */
export const CANVAS_PANEL_ATTRIBUTE = "data-canvas-panel";

/** Which canvas panel is open, and what opens and closes them. */
export interface CanvasPanels {
  /** The open panel; undefined while all are closed. One opens at a time. */
  readonly open: CanvasPanelId | undefined;
  /** Opens the panel, closing the other, or closes it if it's open. */
  readonly toggle: (id: CanvasPanelId) => void;
  /** Opens the panel, closing the other, whatever was open. */
  readonly show: (id: CanvasPanelId) => void;
  readonly close: () => void;
  /**
   * Opens the panel that holds the element, if it's in one, at once, so
   * the element can take the focus straight after.
   */
  readonly reveal: (element: HTMLElement) => void;
}

/** The panel ids, so an attribute's value can be checked against them. */
const PANEL_IDS: ReadonlySet<string> = new Set<CanvasPanelId>([
  "add",
  "connect",
  "workflows",
  "workloads",
  "text",
]);

/**
 * The canvas panels' state, held by the screen rather than the panels, so
 * a change elsewhere can open one: a workflow's remove opens "Workflows"
 * (a workload's, "Workloads"), where the focus goes next, and closing
 * Details opens the panel that
 * holds the button that made the selection. Both start closed.
 */
export function useCanvasPanels(): CanvasPanels {
  const [open, setOpen] = useState<CanvasPanelId>();
  const toggle = useCallback((id: CanvasPanelId) => {
    setOpen((current) => (current === id ? undefined : id));
  }, []);
  const close = useCallback(() => {
    setOpen(undefined);
  }, []);
  const reveal = useCallback((element: HTMLElement) => {
    const id = panelOf(element);
    if (id === undefined) return;
    flushSync(() => {
      setOpen(id);
    });
  }, []);
  return useMemo(
    () => ({ open, toggle, show: setOpen, close, reveal }),
    [open, toggle, close, reveal],
  );
}

/** The id of the canvas panel the element is in, if it's in one. */
function panelOf(element: HTMLElement): CanvasPanelId | undefined {
  const value = element
    .closest(`[${CANVAS_PANEL_ATTRIBUTE}]`)
    ?.getAttribute(CANVAS_PANEL_ATTRIBUTE);
  if (value === undefined || value === null || !PANEL_IDS.has(value)) {
    return undefined;
  }
  return value as CanvasPanelId;
}
