import type { Overlay, OverlayProps } from "./overlay";
import type { OverlayKey } from "../screen/screen-state";
import { ComponentsOverlay } from "./ComponentsOverlay";
import { RunOverlay } from "./RunOverlay";
import { WorkloadOverlay } from "./WorkloadOverlay";

/** The selected workload's name, if a workload of the project is selected. */
function selectedWorkloadName({ project, selecting }: OverlayProps) {
  const { selection } = selecting;
  if (selection?.kind !== "workload") return undefined;
  return project.workloads.find((w) => w.id === selection.workloadId)?.name;
}

/**
 * Every overlay, by key, in the order of their tabs. A key added to
 * `OverlayKey` doesn't compile until it's registered here.
 */
export const OVERLAYS: Readonly<Record<OverlayKey, Overlay>> = {
  components: {
    shows: () => true,
    label: () => "Components",
    Content: ComponentsOverlay,
  },
  run: {
    shows: ({ projectRun }) => projectRun.ran !== undefined,
    label: () => "Run",
    Content: RunOverlay,
  },
  workload: {
    shows: (props) => selectedWorkloadName(props) !== undefined,
    label: (props) => `Workload: ${selectedWorkloadName(props) ?? ""}`,
    Content: WorkloadOverlay,
  },
};

/** The overlays' keys, in the order of their tabs. */
// The record's keys are exactly OverlayKey, so the assertion holds.
export const OVERLAY_KEYS = Object.keys(OVERLAYS) as readonly OverlayKey[];
