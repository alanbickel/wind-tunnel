import { useCallback, useState } from "react";
import type { Selection } from "../../../application/details/selection";
import type { OverlayRequest } from "./overlay-request";

/** The screen's latest ask for a dock overlay, and how to ask. */
export interface DockRequests {
  /** A new object for each ask, so the dock sees a repeat too. */
  readonly request: OverlayRequest | undefined;
  readonly ask: (request: OverlayRequest) => void;
}

/**
 * How the screen asks the dock for an overlay, by key and what it's
 * about. Each new selection of a workload, the same one again included,
 * asks for its overlay, so the editor shows, unfolded, for its heading to
 * take the focus (UX design §5). Asked while drawing, so the dock shows
 * it in the same render. Neither this nor its callers know what the dock
 * shows.
 */
export function useDockRequests(
  selection: Selection | undefined,
): DockRequests {
  const [request, setRequest] = useState<OverlayRequest>();
  const [seen, setSeen] = useState(selection);
  if (seen !== selection) {
    setSeen(selection);
    const asked = requestFor(selection);
    if (asked !== undefined) setRequest(asked);
  }
  const ask = useCallback((asked: OverlayRequest) => {
    setRequest({ ...asked });
  }, []);
  return { request, ask };
}

/** The overlay a selection asks for: a workload's editor, or none. */
function requestFor(
  selection: Selection | undefined,
): OverlayRequest | undefined {
  if (selection?.kind !== "workload") return undefined;
  return { key: "workload", workloadId: selection.workloadId };
}
