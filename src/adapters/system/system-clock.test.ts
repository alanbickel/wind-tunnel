import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemClock } from "./system-clock";

describe("SystemClock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the system time as UTC ISO 8601 with milliseconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 9, 15, 9, 30, 0, 5));

    expect(new SystemClock().now()).toBe("2026-10-15T09:30:00.005Z");
  });
});
