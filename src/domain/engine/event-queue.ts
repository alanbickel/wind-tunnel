/** An event waiting in the queue, with the simulated time it is due. */
export interface ScheduledEvent<T> {
  readonly timeMs: number;
  /** Order of scheduling; breaks ties between events due at the same time. */
  readonly sequence: number;
  readonly payload: T;
}

/**
 * Future events, ordered by time and then by the order they were scheduled
 * (MVP design §4.1, §4.2). Ties must be broken the same way on every run, or
 * two runs with the same seed could diverge.
 */
export interface EventQueue<T> {
  readonly size: number;
  /** Adds an event due at `timeMs`, which must be finite. */
  schedule(timeMs: number, payload: T): void;
  /** The earliest event, without removing it. */
  peek(): ScheduledEvent<T> | undefined;
  /** Removes and returns the earliest event. */
  pop(): ScheduledEvent<T> | undefined;
}
