import { describe, expect, it } from "vitest";
import { workloadSummary } from "./workload-summary";

const point = (atMs: number, requestsPerSec: number) => ({
  atMs,
  requestsPerSec,
});

describe("workloadSummary", () => {
  // Fails if the line shows the first or last rate instead of the peak.
  it("gives the duration and the peak rate, thousands as k", () => {
    expect(
      workloadSummary({
        durationMs: 20_000,
        profile: [point(0, 100), point(10_000, 2000), point(20_000, 50)],
      }),
    ).toBe("20 s · 2k req/s");
  });

  // Fails if a rate under a thousand gets a k, or one over it loses its decimal.
  it("shows small rates whole and thousands to one decimal", () => {
    const at = (rate: number) =>
      workloadSummary({ durationMs: 5000, profile: [point(0, rate)] });
    expect(at(80)).toBe("5 s · 80 req/s");
    expect(at(1500)).toBe("5 s · 1.5k req/s");
  });

  // Fails if a fractional rate prints raw ("80.54 req/s") instead of to one decimal.
  it("rounds a fractional rate to one decimal", () => {
    const at = (rate: number) =>
      workloadSummary({ durationMs: 5000, profile: [point(0, rate)] });
    expect(at(80.54)).toBe("5 s · 80.5 req/s");
    expect(at(80.5)).toBe("5 s · 80.5 req/s");
  });

  // Fails if an empty profile gives "-Infinity req/s".
  it("gives only the duration when there are no profile points", () => {
    expect(workloadSummary({ durationMs: 60_000, profile: [] })).toBe("60 s");
  });
});
