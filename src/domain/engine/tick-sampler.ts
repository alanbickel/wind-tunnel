import type { RuntimeComponent } from "./runtime-records";

/**
 * Reports a `tick` with every component's state at fixed steps of simulated
 * time, plus one at the end of the run (see `SimulationInput.tickMs`).
 */
export interface TickSampler {
  /** Reports every tick due before `timeMs` and before the end of the run. */
  ticksBefore(timeMs: number): void;
  /** The ticks left before the end, then one at the end itself. */
  finalTick(): void;
  /**
   * Raises the component's peaks to its current values. Called right after
   * every call into a component.
   */
  trackPeaks(component: RuntimeComponent): void;
}
