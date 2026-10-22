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
  at,
  component,
  count,
  duration,
  listOf,
  plural,
  say,
  type Message,
} from "../message";
import {
  addSecond,
  noSeconds,
  spanOfTally,
  type SecondsTally,
} from "../time-window";
import {
  failedWithRejections,
  failureCauses,
  isTimeout,
  type FailureCause,
} from "./failure-causes";

export const RETRIES_ABSORBED = "retries-absorbed";

/**
 * A note for each component that refused more attempts than requests
 * failed with its rejections, a run in which none failed included
 * (findings.md §2.1): callers retried the rest, so the refusals may show
 * only as latency. It explains nothing, so it shows at the top level.
 *
 * `rejected` counts attempts without their reason, so the two counts are of
 * one reason only when the component refuses with one (§2.4). Its reasons
 * are those its limits declare and any its failures carry.
 *
 * When requests failed with its rejections, the failure finding names the
 * limit, its fixes, and its causes, so the note leaves them out. When none
 * did, the note is the only place they can show.
 */
export function retriesAbsorbedDetector(catalog: FindingsCatalog): Detector {
  return {
    id: RETRIES_ABSORBED,
    detect: (run) => {
      const causes = failureCauses(run);
      return run.project.architecture.components.flatMap(({ id }) => {
        const failed = failedWithRejections(causes, id);
        const tally = tallyRefusals(run, id);
        const window = spanOfTally(run.snapshots, tally.refusing);
        if (tally.rejected <= failed || window === undefined) return [];
        const input = { componentId: id, failed, tally, window };
        return [absorbedFinding({ ...input, causes, run, catalog })];
      });
    },
  };
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
  /** Requests that failed with its rejections. */
  readonly failed: number;
  readonly tally: RefusalTally;
  /** From the first second with a refusal to the last. */
  readonly window: TimeWindow;
  readonly causes: readonly FailureCause[];
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
}

function absorbedFinding(input: AbsorbedFindingInput): DetectedFinding {
  const { componentId, tally, window, run, catalog } = input;
  // Its limits only when no failure finding names them (see the detector).
  const limitNames = input.failed === 0 ? [...tally.limitsOut] : [];
  return {
    key: findingKey({ kind: RETRIES_ABSORBED, componentId }),
    severity: "note",
    limitNames,
    window,
    causeWindow: undefined,
    summary: summaryOf(input),
    reasons: [
      secondsSentence(input),
      say`Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.`,
      reasonsSentence(input),
      ...tally.p99s.flatMap((p99s) => latencySentences(p99s, run.project)),
    ],
    evidence: evidenceOf(input),
    ...adviceFor(catalog, { project: run.project, componentId, limitNames }),
    explains: undefined,
    // A note counts nothing: refused attempts aren't requests.
    affected: undefined,
  };
}

function summaryOf({
  componentId,
  failed,
  tally,
}: AbsorbedFindingInput): Message {
  const refused = say`${component(componentId)} refused ${count(tally.rejected)} ${plural(tally.rejected, ["attempt", "attempts"])}`;
  if (failed === 0) {
    return say`${refused}, but no request failed with its rejections: callers retried every one.`;
  }
  return say`${refused}, but only ${count(failed)} ${plural(failed, ["request", "requests"])} failed with its rejections: callers retried the rest.`;
}

function secondsSentence({ tally, window }: AbsorbedFindingInput): Message {
  const n = tally.refusing.count;
  return say`It refused attempts in ${count(n)} ${plural(n, ["second", "seconds"])} from ${at(window.fromMs)} to ${at(window.toMs)}.`;
}

/** How many reasons the component refuses with, for the sentence. */
type ReasonCount = "none" | "one" | "several";

const REASON_SENTENCES: Readonly<
  Record<ReasonCount, (reasons: readonly string[]) => Message>
> = {
  none: () =>
    say`None of its limits declares a rejection reason, and no request failed with one, so the run can't say why it refused.`,
  one: ([reason = ""]) =>
    say`It refuses only with ${reason}, so the attempts and the requests are both ${reason} rejections.`,
  several: (reasons) =>
    say`It refuses with ${listOf(reasons.map((r) => say`${r}`))}, and refused attempts aren't counted by reason, so the run can't say how many of each were retried.`,
};

function reasonsSentence(input: AbsorbedFindingInput): Message {
  const reasons = reasonsOf(input);
  return lookup(REASON_SENTENCES, reasonCount(reasons.length))(reasons);
}

function reasonCount(n: number): ReasonCount {
  if (n === 0) return "none";
  return n === 1 ? "one" : "several";
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
  const failedWith = causes
    .filter((c) => c.componentId === componentId && !isTimeout(c))
    .map((c) => c.reason);
  return [...new Set([...declared, ...failedWith])];
}

/**
 * The workflow's p99 in the median second during the refusals, and the
 * highest, against the median second before them. Seconds' percentiles
 * can't be merged, so the median second stands in for the typical one, and
 * the cold starts of a run's first seconds don't move it.
 */
function latencySentences(p99s: WorkflowP99s, project: Project): Message[] {
  const during = medianOf(p99s.duringMs);
  if (during === undefined) return [];
  const name =
    project.workflows.find((w) => w.id === p99s.workflowId)?.name ??
    p99s.workflowId;
  const highestMs = Math.max(...p99s.duringMs);
  const lasted = say`While it refused attempts, ${name}'s p99 was ${duration(during)} in the median second, and up to ${duration(highestMs)}`;
  const before = medianOf(p99s.beforeMs);
  if (before === undefined) return [say`${lasted}.`];
  return [
    say`${lasted}, against ${duration(before)} in the median second before.`,
  ];
}

/** The middle value, or the lower of the middle two: a second's own p99. */
function medianOf(values: readonly number[]): number | undefined {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

function evidenceOf({
  componentId,
  failed,
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
      value: failed,
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

/** The medians the latency sentence quotes, for the seconds that have one. */
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
