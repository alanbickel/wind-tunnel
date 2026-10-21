import type { ConcurrencyLimit } from "../behaviors/concurrency-limit";
import type { RateLimit } from "../behaviors/rate-limit";
import type {
  ConcurrencyLimitGauge,
  RateLimitGauge,
  RefuseWhenFull,
  WhenFull,
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
  /** Refuse or wait once full; fixed for the run. */
  readonly whenFull: WhenFull;
  /** Read live on every access. */
  readonly source: ConcurrencySource;
}

/** What `rateGauge` wraps, and the name it reports. */
export interface RateGaugeInput {
  /** camelCase, unique within the component, e.g. `requestRate`. */
  readonly name: string;
  /** A bucket always refuses once empty; this gives the reason. */
  readonly whenFull: RefuseWhenFull;
  /** Read live on every access. */
  readonly source: RateSource;
}

/** A live view of `source` as a behavior's limit named `name`. */
export function concurrencyGauge({
  name,
  whenFull,
  source,
}: ConcurrencyGaugeInput): ConcurrencyLimitGauge {
  return {
    kind: "concurrency",
    name,
    whenFull,
    get limit() {
      return source.limit;
    },
    get inUse() {
      return source.inUse;
    },
  };
}

/** A live view of `source` as a behavior's limit named `name`. */
export function rateGauge({
  name,
  whenFull,
  source,
}: RateGaugeInput): RateLimitGauge {
  return {
    kind: "rate",
    name,
    whenFull,
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
