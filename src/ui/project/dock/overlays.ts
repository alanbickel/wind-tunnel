import type { Overlay } from "./overlay";
import type { OverlayKey } from "../screen/screen-state";
import { ComponentsOverlay } from "./ComponentsOverlay";
import { LibraryOverlay } from "./LibraryOverlay";
import { RunOverlay } from "./RunOverlay";
import { WorkloadsOverlay } from "./WorkloadsOverlay";

/**
 * Every overlay, by key, in the order of their tabs. A key added to
 * `OverlayKey` doesn't compile until it's registered here.
 */
export const OVERLAYS: Readonly<Record<OverlayKey, Overlay>> = {
  library: {
    shows: () => true,
    label: () => "Library",
    Content: LibraryOverlay,
  },
  components: {
    shows: () => true,
    label: () => "Components",
    Content: ComponentsOverlay,
  },
  workloads: {
    shows: () => true,
    label: () => "Workloads",
    Content: WorkloadsOverlay,
  },
  run: {
    shows: ({ projectRun }) => projectRun.ran !== undefined,
    label: () => "Run",
    Content: RunOverlay,
  },
};

/** The overlays' keys, in the order of their tabs. */
// The record's keys are exactly OverlayKey, so the assertion holds.
export const OVERLAY_KEYS = Object.keys(OVERLAYS) as readonly OverlayKey[];
