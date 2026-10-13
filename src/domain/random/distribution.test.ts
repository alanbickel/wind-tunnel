import { describe, expect, it } from "vitest";
import { distributionSchema, sample, type Distribution } from "./distribution";
import { SeededRandom, type RandomSource } from "./random-source";

const draw = (distribution: Distribution, count: number, seed = 1) => {
  const random = new SeededRandom(seed);
  return Array.from({ length: count }, () => sample(distribution, random));
};

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * (sorted.length - 1))] ?? Number.NaN;
};

const mean = (values: number[]) =>
  values.reduce((sum, v) => sum + v, 0) / values.length;

describe("sample", () => {
  it("returns the value of a constant distribution", () => {
    expect(draw({ kind: "constant", valueMs: 15 }, 3)).toEqual([15, 15, 15]);
  });

  it("matches the mean of an exponential distribution", () => {
    const values = draw({ kind: "exponential", meanMs: 20 }, 50_000);
    expect(values.every((v) => v >= 0)).toBe(true);
    expect(mean(values)).toBeGreaterThan(19.5);
    expect(mean(values)).toBeLessThan(20.5);
  });

  it("matches the median and p99 of a lognormal distribution", () => {
    const values = draw({ kind: "lognormal", medianMs: 15, p99Ms: 60 }, 50_000);
    expect(values.every((v) => v > 0)).toBe(true);
    expect(percentile(values, 0.5)).toBeGreaterThan(14.5);
    expect(percentile(values, 0.5)).toBeLessThan(15.5);
    expect(percentile(values, 0.99)).toBeGreaterThan(56);
    expect(percentile(values, 0.99)).toBeLessThan(64);
  });

  it("never takes the log of zero when the source returns 0", () => {
    const zeros: RandomSource = { next: () => 0 };
    expect(
      Number.isFinite(sample({ kind: "exponential", meanMs: 10 }, zeros)),
    ).toBe(true);
    expect(
      Number.isFinite(
        sample({ kind: "lognormal", medianMs: 10, p99Ms: 40 }, zeros),
      ),
    ).toBe(true);
  });
});

describe("distributionSchema", () => {
  it("accepts each kind", () => {
    expect(
      distributionSchema.safeParse({ kind: "constant", valueMs: 0 }).success,
    ).toBe(true);
    expect(
      distributionSchema.safeParse({ kind: "exponential", meanMs: 5 }).success,
    ).toBe(true);
    expect(
      distributionSchema.safeParse({ kind: "lognormal", medianMs: 5, p99Ms: 5 })
        .success,
    ).toBe(true);
  });

  it("rejects a lognormal whose p99 is below its median", () => {
    const result = distributionSchema.safeParse({
      kind: "lognormal",
      medianMs: 10,
      p99Ms: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive means", () => {
    expect(
      distributionSchema.safeParse({ kind: "exponential", meanMs: 0 }).success,
    ).toBe(false);
  });
});
