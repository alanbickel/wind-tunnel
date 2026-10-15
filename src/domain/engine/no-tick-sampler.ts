import type { TickSampler } from "./tick-sampler";

/**
 * A `TickSampler` for runs without `tickMs`: no ticks, and no peaks to track,
 * since only a tick reports them.
 */
export class NoTickSampler implements TickSampler {
  ticksBefore(): void {
    // No ticks to report.
  }

  finalTick(): void {
    // No ticks to report.
  }

  trackPeaks(): void {
    // Peaks are only read by ticks.
  }
}
