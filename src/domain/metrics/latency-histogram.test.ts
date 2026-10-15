import { describe, expect, it } from "vitest";
import { LatencyHistogram } from "./latency-histogram";

const histogramOf = (values: number[]) => {
  const histogram = new LatencyHistogram();
  for (const value of values) histogram.record(value);
  return histogram;
};

describe("LatencyHistogram", () => {
  it("has no percentiles until something is recorded", () => {
    const histogram = new LatencyHistogram();
    expect(histogram.percentile(0.5)).toBeUndefined();
    expect(histogram.summary()).toBeUndefined();
  });

  it("reports identical values exactly", () => {
    expect(histogramOf([49, 49, 49]).summary()).toEqual({
      count: 3,
      p50Ms: 49,
      p95Ms: 49,
      p99Ms: 49,
      maxMs: 49,
    });
  });

  it("is within 5% for values spread over several orders of magnitude", () => {
    const values = Array.from({ length: 10_000 }, (_, i) => 1 + i * 1.7);
    const histogram = histogramOf(values);
    for (const quantile of [0.5, 0.95, 0.99]) {
      const exact = values[Math.ceil(quantile * values.length) - 1] ?? 0;
      const reported = histogram.percentile(quantile) ?? 0;
      expect(reported).toBeGreaterThanOrEqual(exact);
      expect(reported / exact).toBeLessThan(1.05);
    }
  });

  it("puts everything up to 1 ms in one bucket, and keeps very large values", () => {
    const histogram = histogramOf([0, 0.4, 3_600_000]);
    expect(histogram.percentile(0.5)).toBe(1);
    expect(histogram.percentile(1)).toBe(3_600_000);
  });

  it("merges, and resets", () => {
    const a = histogramOf([10, 10]);
    a.merge(histogramOf([1_000, 1_000]));
    expect(a.summary()).toMatchObject({ count: 4, maxMs: 1_000 });
    // 10 ms falls in the bucket up to about 10.4 ms.
    expect(a.percentile(0.5)).toBeCloseTo(10.4, 1);
    a.reset();
    expect(a.count).toBe(0);
    expect(a.summary()).toBeUndefined();
  });
});
