import type { Failure } from "../engine/simulation-events";

/**
 * Final failures counted by cause, keyed `"<component>: <reason>"`, such as
 * `"orders-db: too-many-connections"`. Used for failed requests and failed
 * deliveries alike, so both read the same way (ADR-0017).
 */
export class CauseCounts {
  private readonly counts = new Map<string, number>();

  /** Counts one failure against its cause. */
  record(failure: Failure): void {
    this.addTo(`${failure.componentId}: ${failure.reason}`, 1);
  }

  /** Adds another window's counts into these. */
  add(window: CauseCounts): void {
    for (const [cause, count] of window.counts) this.addTo(cause, count);
  }

  clear(): void {
    this.counts.clear();
  }

  /** The counts as a record, in the order each cause was first seen. */
  toRecord(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.counts);
  }

  private addTo(cause: string, count: number): void {
    this.counts.set(cause, (this.counts.get(cause) ?? 0) + count);
  }
}
