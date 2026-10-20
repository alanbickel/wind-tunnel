import { handleKind, type KindHandlers } from "../../shared/kind-handlers";
import type {
  ComponentBehavior,
  ConcurrencyLimitGauge,
  LimitGauge,
  RateLimitGauge,
} from "../component-behavior";

/** A limit's values read at one time, as plain data a test can compare. */
export type LimitValues = ConcurrencyLimitGauge | RateLimitValues;

/** A rate limit with its bucket's level read at that time. */
export interface RateLimitValues extends Omit<RateLimitGauge, "tokensLeft"> {
  readonly tokensLeft: number;
}

/**
 * A behavior's limits as plain values, read at `nowMs`. The limits are live
 * views, so a test copies them to compare against what it expects.
 */
export function limitValues<T>(
  behavior: ComponentBehavior<T>,
  nowMs = 0,
): LimitValues[] {
  return (behavior.limits ?? []).map((limit) =>
    handleKind(READ_VALUES, limit)(nowMs),
  );
}

const READ_VALUES: KindHandlers<LimitGauge, (nowMs: number) => LimitValues> = {
  concurrency:
    ({ kind, name, limit, inUse }) =>
    () => ({ kind, name, limit, inUse }),
  rate: (gauge) => (nowMs) => ({
    kind: gauge.kind,
    name: gauge.name,
    ratePerSec: gauge.ratePerSec,
    burst: gauge.burst,
    taken: gauge.taken,
    tokensLeft: gauge.tokensLeft(nowMs),
  }),
};
