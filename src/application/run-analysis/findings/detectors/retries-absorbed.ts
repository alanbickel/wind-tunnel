import { limitExhausted } from "../../../../domain/metrics/limit-exhausted";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import type { Project, Step } from "../../../../domain/model/project";
import { lookup } from "../../../../domain/shared/kind-handlers";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence, TimeWindow } from "../finding";
import { findingKey } from "../finding-key";
import {
  addSecond,
  noSeconds,
  spanOfTally,
  type SecondsTally,
} from "../time-window";
import { limitRefused } from "./limit-refused";
import {
  RETRIES_ABSORBED_PHRASES,
  type LatencyWhileRefusingStatement,
  type RetriesAbsorbedStatement,
} from "./retries-absorbed-phrases";
import {
  endedByRejections,
  rejectionCauses,
  runCauses,
  type EndedByRejections,
  type FailureCause,
  type RunCauses,
} from "./failure-causes";

export const RETRIES_ABSORBED = "retries-absorbed";

/**
 * A note for each component that refused more attempts than requests and
 * deliveries failed with its rejections, a run in which none failed
 * included (findings.md §2.1): callers retried the rest, so the refusals
 * may show only as latency. A refusal that failed a delivery wasn't
 * retried by a caller: its queue tried the message again, which
 * failed-deliveries says. It explains nothing, so it shows at the top
 * level.
 *
 * `rejected` counts attempts without their reason, so the two counts are of
 * one reason only when the component refuses with one (§2.4). Its reasons
 * are those its limits declare and any its failures carry.
 *
 * The note names the refusing limits that ran out, with their fixes and
 * causes, except those a failure finding already names: limit-refused names
 * a limit that was out in a second with the component's failures.
 */
export function retriesAbsorbedDetector(catalog: FindingsCatalog): Detector {
  return {
    id: RETRIES_ABSORBED,
    detect: (run) => {
      const causes = runCauses(run);
      return run.project.architecture.components.flatMap(({ id }) => {
        const ended = endedByRejections(causes, id);
        const tally = tallyRefusals(run, id);
        const window = spanOfTally(run.snapshots, tally.refusing);
        if (tally.rejected <= endedCount(ended) || window === undefined)
          return [];
        const input = { componentId: id, ended, tally, window };
        return [absorbedFinding({ ...input, causes, run, catalog })];
      });
    },
    phrases: RETRIES_ABSORBED_PHRASES,
  };
}

/** Requests and deliveries that the component's rejections failed. */
function endedCount({ requests, deliveries }: EndedByRejections): number {
  return requests + deliveries;
}

/** One workflow's p99 in each second, before and during the refusals. */
interface WorkflowP99s {
  readonly workflowId: string;
  readonly beforeMs: number[];
  readonly duringMs: number[];
}

/** What one pass over the snapshots found about a component's refusals. */
interface RefusalTally {
  /** Attempts refused, retried ones included. */
  rejected: number;
  /** Seconds in which it refused at least one attempt. */
  readonly refusing: SecondsTally;
  /** Its limits that refuse and ran out in a second with a refusal. */
  readonly limitsOut: Set<string>;
  /** The workflows whose requests call it, in project order. */
  readonly p99s: readonly WorkflowP99s[];
}

function tallyRefusals(run: RunSoFar, componentId: string): RefusalTally {
  const tally: RefusalTally = {
    rejected: 0,
    refusing: noSeconds(),
    limitsOut: new Set(),
    p99s: workflowsCalling(run.project, componentId).map((workflowId) => ({
      workflowId,
      beforeMs: [],
      duringMs: [],
    })),
  };
  run.snapshots.forEach((snapshot, index) => {
    const rejected = snapshot.components[componentId]?.rejected ?? 0;
    tally.rejected += rejected;
    if (rejected > 0)
      addRefusingSecond(tally, { snapshot, index, componentId });
    if (tally.refusing.first === undefined)
      addP99s(tally, { snapshot, phase: "before" });
  });
  return tally;
}

/** A second in which the component refused at least one attempt. */
interface RefusingSecond {
  readonly snapshot: MetricsSnapshot;
  readonly index: number;
  readonly componentId: string;
}

function addRefusingSecond(tally: RefusalTally, second: RefusingSecond): void {
  const { snapshot, index, componentId } = second;
  addSecond(tally.refusing, index);
  addP99s(tally, { snapshot, phase: "during" });
  for (const limit of snapshot.components[componentId]?.limits ?? []) {
    if (refuses(limit) && limitExhausted(limit))
      tally.limitsOut.add(limit.name);
  }
}

/** Which of a workflow's lists a second's p99 goes in. */
type Phase = "before" | "during";

const PHASE_LISTS: Readonly<Record<Phase, (p99s: WorkflowP99s) => number[]>> = {
  before: (p99s) => p99s.beforeMs,
  during: (p99s) => p99s.duringMs,
};

/** A second's p99s, and which of the lists they go in. */
interface P99Second {
  readonly snapshot: MetricsSnapshot;
  readonly phase: Phase;
}

function addP99s(tally: RefusalTally, { snapshot, phase }: P99Second): void {
  for (const p99s of tally.p99s) {
    const p99Ms = snapshot.workflows[p99s.workflowId]?.latency?.p99Ms;
    if (p99Ms !== undefined) lookup(PHASE_LISTS, phase)(p99s).push(p99Ms);
  }
}

function refuses(limit: LimitUse): boolean {
  return limit.whenFull.kind === "refuse";
}

/**
 * The workflows whose requests wait for the component: it's on the path of
 * calls from the root step. Work a step hands off as async doesn't hold up
 * the request, so it isn't followed.
 */
function workflowsCalling(project: Project, componentId: string): string[] {
  return project.workflows
    .filter((w) => calls(w.root, componentId))
    .map((w) => w.id);
}

function calls(step: Step, componentId: string): boolean {
  return (
    step.componentId === componentId ||
    (step.calls ?? []).some((c) => calls(c, componentId))
  );
}

/** Everything a note is built from. */
interface AbsorbedFindingInput {
  readonly componentId: string;
  /** Requests and deliveries that failed with its rejections. */
  readonly ended: EndedByRejections;
  readonly tally: RefusalTally;
  /** From the first second with a refusal to the last. */
  readonly window: TimeWindow;
  readonly causes: RunCauses;
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
}

function absorbedFinding(input: AbsorbedFindingInput): DetectedFinding {
  const { componentId, window, run, catalog } = input;
  const limitNames = limitsNamedOnlyHere(input);
  return {
    key: findingKey({ kind: RETRIES_ABSORBED, componentId }),
    severity: "note",
    limitNames,
    window,
    causeWindow: undefined,
    summary: summaryOf(input),
    reasons: statementsOf(input),
    evidence: evidenceOf(input),
    ...adviceFor(catalog, { project: run.project, componentId, limitNames }),
    explains: undefined,
    // A note counts nothing: refused attempts aren't requests.
    affected: undefined,
  };
}

function summaryOf({
  componentId,
  ended,
  tally,
}: AbsorbedFindingInput): RetriesAbsorbedStatement {
  return {
    kind: "retries-absorbed",
    componentId,
    rejected: tally.rejected,
    failedRequests: ended.requests,
    failedDeliveries: ended.deliveries,
  };
}

function statementsOf(input: AbsorbedFindingInput): RetriesAbsorbedStatement[] {
  const { componentId, tally, window } = input;
  return [
    {
      kind: "refusing-seconds",
      componentId,
      seconds: tally.refusing.count,
      window,
    },
    { kind: "attempts-are-not-requests" },
    { kind: "refusal-reasons", componentId, reasons: reasonsOf(input) },
    ...tally.p99s.flatMap((p99s) => latencyStatements(p99s, componentId)),
  ];
}

/** The limits that ran out while it refused, less those a failure finding names. */
function limitsNamedOnlyHere(input: AbsorbedFindingInput): string[] {
  const named = limitsNamedByFailures(input);
  return [...input.tally.limitsOut].filter((name) => !named.has(name));
}

/** The limits a failed-requests or failed-deliveries finding names. */
function limitsNamedByFailures({
  componentId,
  ended,
  causes,
  run,
}: AbsorbedFindingInput): Set<string> {
  const refusals = rejectionsAt(causes, componentId).map((cause) =>
    limitRefused({ run, cause, endedAtComponent: ended }),
  );
  return new Set(refusals.flatMap((r) => r.limits.map((l) => l.name)));
}

/** The component's own rejections that failed requests or deliveries. */
function rejectionsAt(causes: RunCauses, componentId: string): FailureCause[] {
  return [
    ...rejectionCauses(causes.requests, componentId),
    ...rejectionCauses(causes.deliveries, componentId),
  ];
}

/** The reasons its limits declare, then any other its failures carry. */
function reasonsOf({
  componentId,
  causes,
  run,
}: AbsorbedFindingInput): string[] {
  const limits = run.snapshots.at(-1)?.components[componentId]?.limits ?? [];
  const declared = limits.flatMap((l) =>
    l.whenFull.kind === "refuse" ? [l.whenFull.reason] : [],
  );
  const failedWith = rejectionsAt(causes, componentId).map((c) => c.reason);
  return [...new Set([...declared, ...failedWith])];
}

/**
 * The workflow's p99 in the median second during the refusals, and the
 * highest, against the median second before them. Seconds' percentiles
 * can't be merged, so the median second stands in for the typical one, and
 * the cold starts of a run's first seconds don't move it.
 */
function latencyStatements(
  p99s: WorkflowP99s,
  componentId: string,
): LatencyWhileRefusingStatement[] {
  const medianMs = medianOf(p99s.duringMs);
  if (medianMs === undefined) return [];
  return [
    {
      kind: "latency-while-refusing",
      componentId,
      workflowId: p99s.workflowId,
      medianMs,
      highestMs: Math.max(...p99s.duringMs),
      beforeMs: medianOf(p99s.beforeMs),
    },
  ];
}

/** The middle value, or the lower of the middle two: a second's own p99. */
function medianOf(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function evidenceOf({
  componentId,
  ended,
  tally,
}: AbsorbedFindingInput): Evidence[] {
  const evidence: Evidence[] = [
    {
      what: `${componentId}: attempts rejected`,
      value: tally.rejected,
      source: "totals",
    },
    {
      what: `${componentId}: requests failed with its rejections`,
      value: ended.requests,
      source: "totals",
    },
    {
      what: `${componentId}: deliveries failed with its rejections`,
      value: ended.deliveries,
      source: "totals",
    },
    {
      what: `${componentId}: seconds with an attempt rejected`,
      value: tally.refusing.count,
      source: "snapshots",
    },
  ];
  return [...evidence, ...tally.p99s.flatMap(p99Evidence)];
}

/** The medians the latency statement quotes, for the seconds that have one. */
function p99Evidence(p99s: WorkflowP99s): Evidence[] {
  return [
    ...medianEvidence(p99s, {
      when: "before the first second with a rejection",
      valuesMs: p99s.beforeMs,
    }),
    ...medianEvidence(p99s, {
      when: "in the seconds with a rejection",
      valuesMs: p99s.duringMs,
    }),
  ];
}

/** Some of a workflow's per-second p99s, and which seconds they are. */
interface P99Seconds {
  readonly when: string;
  readonly valuesMs: readonly number[];
}

function medianEvidence(
  { workflowId }: WorkflowP99s,
  { when, valuesMs }: P99Seconds,
): Evidence[] {
  const valueMs = medianOf(valuesMs);
  if (valueMs === undefined) return [];
  return [
    {
      what: `${workflowId}: the median second's latency.p99Ms ${when}`,
      value: valueMs,
      source: "snapshots",
    },
  ];
}
