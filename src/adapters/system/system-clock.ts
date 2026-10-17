import type { Clock } from "../../application/ports/clock";

/** `Clock` over the system clock. Works in the browser, a Worker, and Node. */
export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}
