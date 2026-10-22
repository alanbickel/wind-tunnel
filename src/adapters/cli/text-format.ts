// Number formats shared by the CLI's report sections.

/** A whole number with thousands separators, e.g. "28,841". */
export function count(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * A share as a percentage rounded down to 0.1%, so 100% only shows when it's
 * all of it. The slack keeps float error (0.29 × 1000 = 289.999…) from
 * rounding an exact share down a step.
 */
export function shareDown(fraction: number | undefined): string {
  if (fraction === undefined) return "-";
  const tenths = Math.floor(1000 * fraction + 1e-9);
  return `${(tenths / 10).toFixed(1)}%`;
}

/** A time from the run's start in seconds, to 0.1 s, e.g. "47". */
export function seconds(timeMs: number): string {
  return String(Math.round(timeMs / 100) / 10);
}
