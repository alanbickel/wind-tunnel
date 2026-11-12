import { lazy, Suspense, useId } from "react";
import { LoadFailureBoundary } from "../shared/load-failure-boundary";
import { PLOT_STYLE } from "./plot-style";
import type { RateLineContent } from "./rate-line";

// Recharts arrives in its own chunk the first time a chart draws, as the
// run's charts do (#16).
const ProfilePlot = lazy(() =>
  import("./ProfilePlot").then((module) => ({ default: module.ProfilePlot })),
);

// Holds the plot's place while Recharts loads, or if it can't.
const STAND_IN_STYLE = {
  ...PLOT_STYLE,
  color: "var(--color-text-muted)",
} as const;

/** The chart's name, which labels it for screen readers. */
export const PROFILE_CHART_TITLE = "Request rate over time";

export interface ProfileChartProps {
  readonly line: RateLineContent;
}

/**
 * A picture of a workload's profile (ADR-0011): the arrival rate over the
 * run, with the run's end marked. It's read-only: the table beside it is
 * where the points are read and changed, and is the accessible version, so
 * the plot has a short label and nothing to focus. A profile with no
 * points has nothing to draw.
 */
export function ProfileChart({ line }: ProfileChartProps) {
  const labelId = useId();
  if (line.within.length === 0) return null;
  return (
    <figure aria-labelledby={labelId}>
      <figcaption id={labelId}>{PROFILE_CHART_TITLE}</figcaption>
      <LoadFailureBoundary
        failure={
          <div style={STAND_IN_STYLE}>
            Couldn't load the chart. Reload the page to try again.
          </div>
        }
      >
        <Suspense
          fallback={<div style={STAND_IN_STYLE}>Loading the chart…</div>}
        >
          <ProfilePlot line={line} />
        </Suspense>
      </LoadFailureBoundary>
      <p>{line.endText}</p>
    </figure>
  );
}
