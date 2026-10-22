import { limitExhausted } from "../../../domain/metrics/limit-exhausted";
import { lookup } from "../../../domain/shared/kind-handlers";
import { count, say, type Message } from "./message";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../../domain/metrics/metrics-snapshot";

/** One limit of one component, by name. */
export interface LimitRef {
  readonly componentId: string;
  readonly name: string;
}

/** The limit's use in the snapshot, or undefined if it doesn't report it. */
export function limitUseIn(
  snapshot: MetricsSnapshot | undefined,
  { componentId, name }: LimitRef,
): LimitUse | undefined {
  return snapshot?.components[componentId]?.limits.find((l) => l.name === name);
}

/** Whether the limit ran out in the snapshot, by `limitExhausted`'s rule. */
export function exhaustedIn(
  snapshot: MetricsSnapshot | undefined,
  ref: LimitRef,
): boolean {
  const use = limitUseIn(snapshot, ref);
  return use !== undefined && limitExhausted(use);
}

/** A limit's kind and size, to quote an amount of it. */
export type LimitSize = Pick<LimitUse, "kind" | "limit">;

/** What a limit's numbers count, after the limit: slots need no word. */
const UNITS: Readonly<Record<LimitUse["kind"], string>> = {
  concurrency: "",
  rate: " tokens drawn",
};

/** "13 of 90", or "7,497 of 7,500 tokens drawn" for a rate limit. */
export function amountOf(limit: LimitSize, amount: number): Message {
  return say`${count(amount)} of ${count(limit.limit)}${lookup(UNITS, limit.kind)}`;
}
