import type { Clock } from "../ports/clock";

/** Always returns the same time unless the test moves it with `set`. */
export class FixedClock implements Clock {
  private time: string;

  constructor(isoTime: string) {
    this.time = isoTime;
  }

  set(isoTime: string): void {
    this.time = isoTime;
  }

  now(): string {
    return this.time;
  }
}
