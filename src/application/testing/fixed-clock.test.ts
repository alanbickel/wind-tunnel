import { describe, expect, it } from "vitest";
import { FixedClock } from "./fixed-clock";

describe("FixedClock", () => {
  it("returns the time it was given until moved", () => {
    const clock = new FixedClock("2026-10-15T09:30:00.000Z");
    expect(clock.now()).toBe("2026-10-15T09:30:00.000Z");
    clock.set("2026-10-15T10:00:00.000Z");
    expect(clock.now()).toBe("2026-10-15T10:00:00.000Z");
  });
});
