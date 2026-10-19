import type { StopListener, StopSignal } from "../ports/stop-signal";

/** A `StopSignal` a test fires by calling `stop()`, like an `AbortController`. */
export class ManualStopSignal implements StopSignal {
  private readonly listeners = new Set<StopListener>();
  private stopped = false;

  get aborted(): boolean {
    return this.stopped;
  }

  /** How many listeners are waiting, so a test can check none leaked. */
  get listenerCount(): number {
    return this.listeners.size;
  }

  addEventListener(_type: "abort", listener: StopListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "abort", listener: StopListener): void {
    this.listeners.delete(listener);
  }

  /** Fires the signal once; later calls do nothing. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.listeners.forEach((listener) => {
      listener();
    });
  }
}
