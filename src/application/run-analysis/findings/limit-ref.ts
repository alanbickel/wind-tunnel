import { limitExhausted } from "../../../domain/metrics/limit-exhausted";
import {
  handleKind,
  lookup,
  type KindHandlers,
} from "../../../domain/shared/kind-handlers";
import type { WhenFull } from "../../../domain/components/component-behavior";
import type { RunSoFar } from "../run-so-far";
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

/** One limit of one component, as the latest snapshot reports it. */
export interface ComponentLimit {
  readonly componentId: string;
  readonly use: LimitUse;
}

/**
 * Every limit the latest snapshot reports, by component in project order.
 * The declarations never change during a run, so the latest is enough.
 */
export function reportedLimits(run: RunSoFar): ComponentLimit[] {
  const last = run.snapshots.at(-1);
  return run.project.architecture.components.flatMap(({ id }) =>
    (last?.components[id]?.limits ?? []).map((use) => ({
      componentId: id,
      use,
    })),
  );
}

/** Whether waiting work holds nothing: a backlog, not a held limit. */
const HOLDS_NOTHING: KindHandlers<WhenFull, boolean> = {
  refuse: () => false,
  wait: ({ holds }) => holds === undefined,
};

/**
 * Whether the limit makes work wait and holds nothing while it does, as a
 * queue's consumers do: its waiting work is a backlog, and its slots held
 * are messages being delivered.
 */
export function holdsNothing(use: LimitUse): boolean {
  return handleKind(HOLDS_NOTHING, use.whenFull);
}
