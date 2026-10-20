import type { ComponentBehavior, LimitGauge } from "../component-behavior";

/**
 * A behavior's limits as plain values, read now. The limits are live views,
 * so a test copies them to compare against what it expects.
 */
export function limitValues<T>(behavior: ComponentBehavior<T>): LimitGauge[] {
  return (behavior.limits ?? []).map((limit) => ({ ...limit }));
}
