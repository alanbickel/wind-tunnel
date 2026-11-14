import { RunEvidence } from "../../run/RunEvidence";
import type { OverlayProps } from "./overlay";

/** The dock's Run overlay: the latest run's totals and charts. */
export function RunOverlay({ projectRun }: OverlayProps) {
  return (
    <RunEvidence
      meaning={projectRun.meaning}
      outOfDate={projectRun.outOfDate}
    />
  );
}
