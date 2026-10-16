import { describe, expect, it } from "vitest";
import { SeededRandom } from "../random/seeded-random";
import { SampledServiceTime } from "./sampled-service-time";

describe("SampledServiceTime", () => {
  it("returns the constant duration", () => {
    const time = new SampledServiceTime(
      { kind: "constant", valueMs: 15 },
      new SeededRandom(1),
    );
    expect([time.next(), time.next()]).toEqual([15, 15]);
  });

  it("is reproducible for the same seed", () => {
    const dist = { kind: "lognormal", medianMs: 15, p99Ms: 60 } as const;
    const a = new SampledServiceTime(dist, new SeededRandom(9));
    const b = new SampledServiceTime(dist, new SeededRandom(9));
    expect([a.next(), a.next(), a.next()]).toEqual([
      b.next(),
      b.next(),
      b.next(),
    ]);
  });

  it("varies between samples for a random distribution", () => {
    const time = new SampledServiceTime(
      { kind: "exponential", meanMs: 10 },
      new SeededRandom(1),
    );
    expect(time.next()).not.toBe(time.next());
  });
});
