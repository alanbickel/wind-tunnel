import { useCallback, useMemo, useState } from "react";

/** The panels at the canvas's bottom left: the workflows, and the text version. */
export type CanvasPanelId = "workflows" | "text";

/** Which canvas panel is open, and what opens and closes them. */
export interface CanvasPanels {
  /** The open panel; undefined while both are closed. One opens at a time. */
  readonly open: CanvasPanelId | undefined;
  /** Opens the panel, closing the other, or closes it if it's open. */
  readonly toggle: (id: CanvasPanelId) => void;
  /** Opens the panel, closing the other, whatever was open. */
  readonly show: (id: CanvasPanelId) => void;
  readonly close: () => void;
}

/**
 * The canvas panels' state, held by the screen rather than the panels, so
 * a change elsewhere can open one: a workflow's remove opens "Workflows",
 * where the focus goes next. Both start closed.
 */
export function useCanvasPanels(): CanvasPanels {
  const [open, setOpen] = useState<CanvasPanelId>();
  const toggle = useCallback((id: CanvasPanelId) => {
    setOpen((current) => (current === id ? undefined : id));
  }, []);
  const close = useCallback(() => {
    setOpen(undefined);
  }, []);
  return useMemo(
    () => ({ open, toggle, show: setOpen, close }),
    [open, toggle, close],
  );
}
