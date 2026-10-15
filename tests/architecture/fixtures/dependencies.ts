// Fixture for dependency-types.test.ts: one case of each shape the check must
// tell apart. Nothing imports this file.

class Stopwatch {
  elapsedMs(): number {
    return 0;
  }
}

interface Timer {
  elapsedMs(): number;
}

/** Interfaces, data, and built-ins: allowed. */
export interface GoodDependencies {
  readonly timer: Timer;
  readonly timers: Map<string, Timer>;
  readonly seed: number;
}

/** A class, directly and inside a union: both rejected. */
export interface BadDependencies {
  readonly stopwatch: Stopwatch;
  readonly spare?: Stopwatch;
}

/** A type alias is checked the same way as an interface. */
export type AliasDependencies = Pick<BadDependencies, "stopwatch">;

/** Not named `*Dependencies`, so not checked. */
export interface StopwatchInput {
  readonly stopwatch: Stopwatch;
}
