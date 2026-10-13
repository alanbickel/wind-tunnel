import { describe, expect, it } from "vitest";
import { SeededRandom } from "../random/random-source";
import { ServiceTime } from "./service-time";

describe("ServiceTime", () => {
  it("returns the constant duration", () => {
    const time = new ServiceTime(
      { kind: "constant", valueMs: 15 },
      new SeededRandom(1),
    );
    expect([time.next(), time.next()]).toEqual([15, 15]);
  });

  it("is reproducible for the same seed", () => {
    const dist = { kind: "lognormal", medianMs: 15, p99Ms: 60 } as const;
    const a = new ServiceTime(dist, new SeededRandom(9));
    const b = new ServiceTime(dist, new SeededRandom(9));
    expect([a.next(), a.next(), a.next()]).toEqual([
      b.next(),
      b.next(),
      b.next(),
    ]);
  });

  it("varies between samples for a random distribution", () => {
    const time = new ServiceTime(
      { kind: "exponential", meanMs: 10 },
      new SeededRandom(1),
    );
    expect(time.next()).not.toBe(time.next());
  });
});
