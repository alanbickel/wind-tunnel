import type { ConcurrencyLimit } from "../behaviors/concurrency-limit";
import type { RateLimit } from "../behaviors/rate-limit";
import type {
  ConcurrencyLimitGauge,
  RateLimitGauge,
} from "./component-behavior";

/** What a concurrency gauge reads: a `ConcurrencyLimit`, or a plain count. */
export type ConcurrencySource = Pick<
  ConcurrencyLimit<unknown>,
  "limit" | "inUse"
>;

/** What a rate gauge reads: a `RateLimit`. */
export type RateSource = Pick<
  RateLimit,
  "ratePerSec" | "burst" | "taken" | "available"
>;

/** What `concurrencyGauge` wraps, and the name it reports. */
export interface ConcurrencyGaugeInput {
  /** camelCase, unique within the component, e.g. `connections`. */
  readonly name: string;
  /** Read live on every access. */
  readonly source: ConcurrencySource;
}

/** What `rateGauge` wraps, and the name it reports. */
export interface RateGaugeInput {
  /** camelCase, unique within the component, e.g. `requestRate`. */
  readonly name: string;
  /** Read live on every access. */
  readonly source: RateSource;
}

/** A live view of `source` as a behavior's limit named `name`. */
export function concurrencyGauge({
  name,
  source,
}: ConcurrencyGaugeInput): ConcurrencyLimitGauge {
  return {
    kind: "concurrency",
    name,
    get limit() {
      return source.limit;
    },
    get inUse() {
      return source.inUse;
    },
  };
}

/** A live view of `source` as a behavior's limit named `name`. */
export function rateGauge({ name, source }: RateGaugeInput): RateLimitGauge {
  return {
    kind: "rate",
    name,
    get ratePerSec() {
      return source.ratePerSec;
    },
    get burst() {
      return source.burst;
    },
    get taken() {
      return source.taken;
    },
    tokensLeft(nowMs) {
      return source.available(nowMs);
    },
  };
}
