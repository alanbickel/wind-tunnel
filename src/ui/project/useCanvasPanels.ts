import { useCallback, useMemo, useState } from "react";

/**
 * The canvas's panels: the tool rail's one, Connect's hint, until the
 * connect hint on the canvas replaces it (slice 7 of issue 246).
 */
export type CanvasPanelId = "connect";

/** Which canvas panel is open, and what opens and closes it. */
export interface CanvasPanels {
  /** The open panel; undefined while it's closed. */
  readonly open: CanvasPanelId | undefined;
  /** Opens the panel, or closes it if it's open. */
  readonly toggle: (id: CanvasPanelId) => void;
  readonly close: () => void;
}

/** The canvas panel's state, held by the screen. It starts closed. */
export function useCanvasPanels(): CanvasPanels {
  const [open, setOpen] = useState<CanvasPanelId>();
  const toggle = useCallback((id: CanvasPanelId) => {
    setOpen((current) => (current === id ? undefined : id));
  }, []);
  const close = useCallback(() => {
    setOpen(undefined);
  }, []);
  return useMemo(() => ({ open, toggle, close }), [open, toggle, close]);
}
