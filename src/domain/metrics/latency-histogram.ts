/** Latency percentiles for a set of recorded values, in milliseconds. */
export interface LatencySummary {
  readonly count: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

/** Each bucket is this much wider than the one before: about 5% error. */
const GROWTH = 1.05;
const LARGEST_BOUND_MS = 10 * 60 * 1000;

/**
 * Upper bounds of the buckets, in ms: 1, 1.05, 1.1025, ... up to 10 minutes,
 * about 270 in all. Values above the last bound go in one overflow bucket.
 */
const BOUNDS: readonly number[] = (() => {
  const bounds: number[] = [];
  for (let bound = 1; bound < LARGEST_BOUND_MS * GROWTH; bound *= GROWTH) {
    bounds.push(bound);
  }
  return bounds;
})();

/**
 * Counts latencies in fixed buckets whose width grows with the value, so
 * memory stays constant however many values are recorded, and percentiles
 * are within about 5% at any scale (MVP design §4.3).
 *
 * A percentile is reported as its bucket's upper bound, clamped to the
 * smallest and largest values recorded. So a run where every request takes
 * exactly 49 ms reports 49 ms, not the bucket's 49.9.
 */
export class LatencyHistogram {
  private readonly counts = new Float64Array(BOUNDS.length + 1);
  private total = 0;
  private min = Infinity;
  private max = -Infinity;

  get count(): number {
    return this.total;
  }

  record(valueMs: number): void {
    const bucket = bucketOf(valueMs);
    this.counts[bucket] = (this.counts[bucket] ?? 0) + 1;
    this.total++;
    if (valueMs < this.min) this.min = valueMs;
    if (valueMs > this.max) this.max = valueMs;
  }

  /** Adds `other`'s values to this histogram. */
  merge(other: LatencyHistogram): void {
    for (let i = 0; i < this.counts.length; i++) {
      this.counts[i] = (this.counts[i] ?? 0) + (other.counts[i] ?? 0);
    }
    this.total += other.total;
    this.min = Math.min(this.min, other.min);
    this.max = Math.max(this.max, other.max);
  }

  reset(): void {
    this.counts.fill(0);
    this.total = 0;
    this.min = Infinity;
    this.max = -Infinity;
  }

  /**
   * The value `quantile` (0 to 1) of the way through the recorded values,
   * by the nearest-rank method; undefined if nothing was recorded.
   */
  percentile(quantile: number): number | undefined {
    if (this.total === 0) return undefined;
    const rank = Math.max(1, Math.ceil(quantile * this.total));
    let seen = 0;
    for (let i = 0; i < this.counts.length; i++) {
      seen += this.counts[i] ?? 0;
      if (seen >= rank) {
        const upper = BOUNDS[i] ?? this.max;
        return Math.min(Math.max(upper, this.min), this.max);
      }
    }
    return this.max;
  }

  /** p50, p95, p99, and max; undefined if nothing was recorded. */
  summary(): LatencySummary | undefined {
    if (this.total === 0) return undefined;
    return {
      count: this.total,
      p50Ms: this.percentile(0.5) ?? 0,
      p95Ms: this.percentile(0.95) ?? 0,
      p99Ms: this.percentile(0.99) ?? 0,
      maxMs: this.max,
    };
  }
}

/** The first bucket whose upper bound is at least `valueMs`. */
function bucketOf(valueMs: number): number {
  let low = 0;
  let high = BOUNDS.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((BOUNDS[mid] ?? Infinity) < valueMs) low = mid + 1;
    else high = mid;
  }
  return low;
}
