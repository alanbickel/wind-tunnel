/** Asks the dock for the run's evidence: its totals and charts. */
export interface RunOverlayRequest {
  readonly key: "run";
}

/** Asks the dock for a workload's editor. */
export interface WorkloadOverlayRequest {
  readonly key: "workload";
  readonly workloadId: string;
}

/**
 * What the screen asks the dock to show: an overlay by its key, and what
 * it's about, never a copy of its data. The dock decides what it shows.
 */
export type OverlayRequest = RunOverlayRequest | WorkloadOverlayRequest;

/** The dock's overlays, by name. */
export type OverlayKey = OverlayRequest["key"];
