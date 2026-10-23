import { PERCENTILE_ERROR } from "../../../../domain/metrics/latency-histogram";
import { limitExhausted } from "../../../../domain/metrics/limit-exhausted";
import type {
  ComponentMetrics,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence } from "../finding";
import { findingKey } from "../finding-key";
import { spanOf } from "../time-window";
import { asyncTargets, type AsyncTarget } from "./async-targets";
import {
  LATE_ASYNC_WORK_PHRASES,
  type WorkFinishedLateStatement,
  type LateAsyncWorkStatement,
  type WaitLimit,
} from "./late-async-work-phrases";

export const LATE_ASYNC_WORK = "late-async-work";

/**
 * A warning for each queue whose deliveries landed later than its
 * workflows' entry edge would let a synchronous caller wait: in some
 * second, the p99 of the deliveries that ended in it was over the timeout
 * (findings.md §2.1). The p99 is a bucket's upper bound, so the finding
 * says when the gap is within the histogram's error.
 *
 * It reads the per-second p99s because the snapshots are all the run panel
 * has; percentiles of separate seconds can't be merged into the run's.
 */
export function lateAsyncWorkDetector(catalog: FindingsCatalog): Detector {
  return {
    id: LATE_ASYNC_WORK,
    detect: (run) =>
      asyncTargets(run.project).flatMap((target) => {
        const late = lateSeconds(target, run);
        if (late.first === undefined) return [];
        return [lateFinding({ target, late, run, catalog, first: late.first })];
      }),
    phrases: LATE_ASYNC_WORK_PHRASES,
  };
}

/** What one pass over the snapshots found about a queue's deliveries. */
interface LateSeconds {
  /** Indexes of the first and last seconds whose p99 was over the timeout. */
  first: number | undefined;
  last: number;
  /** Seconds whose p99 was over the timeout. */
  over: number;
  /** Of those, the ones within the histogram's error of it. */
  near: number;
  highestP99Ms: number;
  /** The slowest delivery of the run so far: exact, not a bucket bound. */
  slowestMs: number;
  /** Each workflow's highest answered p99 in the seconds over. */
  readonly answeredP99Ms: Map<string, number>;
  /** The queue's limits that make work wait and ran out in some second. */
  readonly waitingLimitsOut: Set<string>;
}

/** One second of the run, for the queue `target` names. */
interface SecondInput {
  readonly snapshot: MetricsSnapshot;
  readonly index: number;
  readonly target: AsyncTarget;
}

function lateSeconds(target: AsyncTarget, run: RunSoFar): LateSeconds {
  const late: LateSeconds = {
    first: undefined,
    last: 0,
    over: 0,
    near: 0,
    highestP99Ms: 0,
    slowestMs: 0,
    answeredP99Ms: new Map(),
    waitingLimitsOut: new Set(),
  };
  run.snapshots.forEach((snapshot, index) => {
    const metrics = snapshot.components[target.queueId];
    if (metrics === undefined) return;
    addSecond(late, metrics);
    addLateSecond(late, { snapshot, index, target });
  });
  return late;
}

/** The slowest delivery and the waiting limits that ran out, every second. */
function addSecond(late: LateSeconds, metrics: ComponentMetrics): void {
  late.slowestMs = Math.max(late.slowestMs, metrics.asyncLatency?.maxMs ?? 0);
  for (const limit of metrics.limits) {
    if (limit.whenFull.kind === "wait" && limitExhausted(limit)) {
      late.waitingLimitsOut.add(limit.name);
    }
  }
}

/** Counts the second if its p99 was over the timeout. */
function addLateSecond(late: LateSeconds, second: SecondInput): void {
  const { snapshot, index, target } = second;
  const p99Ms = snapshot.components[target.queueId]?.asyncLatency?.p99Ms ?? 0;
  const { timeoutMs } = target.entryEdge;
  if (p99Ms <= timeoutMs) return;
  late.first ??= index;
  late.last = index;
  late.over++;
  if (p99Ms <= timeoutMs * (1 + PERCENTILE_ERROR)) late.near++;
  late.highestP99Ms = Math.max(late.highestP99Ms, p99Ms);
  addAnswered(late, second);
}

/** Each workflow's p99 in a late second, if higher than before. */
function addAnswered(
  late: LateSeconds,
  { snapshot, target }: SecondInput,
): void {
  for (const id of target.workflowIds) {
    const answeredMs = snapshot.workflows[id]?.latency?.p99Ms ?? 0;
    const highestMs = late.answeredP99Ms.get(id) ?? 0;
    late.answeredP99Ms.set(id, Math.max(highestMs, answeredMs));
  }
}

/** Everything a late-work finding is built from. */
interface LateFindingInput {
  readonly target: AsyncTarget;
  readonly late: LateSeconds;
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
  readonly first: number;
}

function lateFinding(input: LateFindingInput): DetectedFinding {
  const { target, late, run, first, catalog } = input;
  const limitNames = [...late.waitingLimitsOut];
  const advice = adviceFor(catalog, {
    project: run.project,
    componentId: target.queueId,
    limitNames,
  });
  return {
    key: findingKey({ kind: LATE_ASYNC_WORK, componentId: target.queueId }),
    severity: "warning",
    limitNames,
    window: spanOf({ snapshots: run.snapshots, first, last: late.last }),
    causeWindow: undefined,
    summary: summaryOf(input),
    reasons: reasonsOf(input),
    evidence: evidenceOf(input),
    ...advice,
    explains: undefined,
    // The histogram gives percentiles, not counts above a value.
    affected: undefined,
  };
}

function summaryOf({
  target,
  late,
}: LateFindingInput): WorkFinishedLateStatement {
  return {
    kind: "late-async-work",
    queueId: target.queueId,
    slowestMs: late.slowestMs,
    wait: waitOf(target),
  };
}

function reasonsOf(input: LateFindingInput): LateAsyncWorkStatement[] {
  return [
    secondsStatement(input),
    ...accuracyStatements(input),
    answeredStatement(input),
    { kind: "no-synchronous-wait", wait: waitOf(input.target) },
  ];
}

function waitOf({ entryEdge }: AsyncTarget): WaitLimit {
  const { from, to, timeoutMs } = entryEdge;
  return { from, to, timeoutMs };
}

function secondsStatement({
  target,
  late,
  run,
  first,
}: LateFindingInput): LateAsyncWorkStatement {
  return {
    kind: "late-seconds",
    over: late.over,
    window: spanOf({ snapshots: run.snapshots, first, last: late.last }),
    timeoutMs: target.entryEdge.timeoutMs,
    highestP99Ms: late.highestP99Ms,
  };
}

/** Says so when some of those seconds are within the histogram's error. */
function accuracyStatements({
  target,
  late,
}: LateFindingInput): LateAsyncWorkStatement[] {
  if (late.near === 0) return [];
  return [
    {
      kind: "late-near-timeout",
      near: late.near,
      timeoutMs: target.entryEdge.timeoutMs,
      percentileError: PERCENTILE_ERROR,
    },
  ];
}

function answeredStatement({
  target,
  late,
}: LateFindingInput): LateAsyncWorkStatement {
  return {
    kind: "answered-quickly",
    answered: target.workflowIds.map((workflowId) => ({
      workflowId,
      p99Ms: late.answeredP99Ms.get(workflowId) ?? 0,
    })),
  };
}

function evidenceOf({ target, late }: LateFindingInput): Evidence[] {
  const q = target.queueId;
  return [
    {
      what: `${target.entryEdge.id}: timeoutMs`,
      value: target.entryEdge.timeoutMs,
      source: "config",
    },
    {
      what: `${q}: the slowest delivery, in ms (max of each second's asyncLatency.maxMs)`,
      value: late.slowestMs,
      source: "snapshots",
    },
    {
      what: `${q}: seconds whose asyncLatency.p99Ms is over the timeout`,
      value: late.over,
      source: "snapshots",
    },
    {
      what: `${q}: of those, seconds within the histogram's error`,
      value: late.near,
      source: "snapshots",
    },
    {
      what: `${q}: the highest asyncLatency.p99Ms of a second, in ms`,
      value: late.highestP99Ms,
      source: "snapshots",
    },
  ];
}
