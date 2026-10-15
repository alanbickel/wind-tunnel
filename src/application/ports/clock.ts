/**
 * Wall-clock time, for timestamps such as `createdAt`. `domain` and
 * `application` never read the system clock directly (ADR-0002), so tests can
 * use a fixed time.
 */
export interface Clock {
  /**
   * The current time in UTC as ISO 8601 with milliseconds, as
   * `Date.prototype.toISOString` writes it (`2026-10-15T09:30:00.000Z`).
   * Timestamps in this one format sort correctly as strings.
   */
  now(): string;
}
