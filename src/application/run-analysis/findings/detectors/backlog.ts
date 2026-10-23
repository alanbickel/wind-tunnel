import type {
  ComponentMetrics,
  LimitUse,
} from "../../../../domain/metrics/metrics-snapshot";
import { lookup } from "../../../../domain/shared/kind-handlers";
import { runFinished, type RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type {
  DetectedFinding,
  Evidence,
  Severity,
  TimeWindow,
} from "../finding";
import { findingKey } from "../finding-key";
import {
  exhaustedIn,
  holdsNothing,
  limitUseIn,
  reportedLimits,
} from "../limit-ref";
import {
  addSecond,
  noSeconds,
  spanOf,
  spanOfTally,
  type SecondsTally,
} from "../time-window";
import {
  BACKLOG_PHRASES,
  type BacklogState,
  type BacklogStatement,
} from "./backlog-phrases";

export const BACKLOG = "backlog";

/**
 * A note for each limit that makes work wait, holds no other limit, and ran
 * out, when its component had messages waiting at the end of a second
 * (findings.md §2.1): SQS `consumerConcurrency`, whose messages wait in the
 * queue's backlog. It explains its own limit, so it shows beneath a finding
 * about that limit, such as late-async-work's, and at the top level if
 * there's none.
 *
 * Messages still waiting at the end of a finished run make it a warning
 * (§3.2). A run stopped early hasn't finished, so its backlog stays a note,
 * said "so far".
 *
 * It reads the seconds with a backlog: those that ended with messages
 * waiting, and the second each backlog emptied in. Its `window` runs from
 * the first to the last of them. Its `causeWindow` starts where the limit
 * ran out: the first second of the unbroken run of seconds with the limit
 * out that leads into the first second with a backlog.
 */
export function backlogDetector(catalog: FindingsCatalog): Detector {
  return {
    id: BACKLOG,
    detect: (run) =>
      waitingLimits(run).flatMap((limit) => {
        const tally = tallyBacklog(limit, run);
        const window = spanOfTally(run.snapshots, tally.backlog);
        if (window === undefined || tally.out.count === 0) return [];
        return [backlogFinding({ limit, tally, window, run, catalog })];
      }),
    phrases: BACKLOG_PHRASES,
  };
}

/** A limit that makes work wait and holds nothing while it does. */
interface WaitingLimit {
  readonly componentId: string;
  readonly use: LimitUse;
}

function waitingLimits(run: RunSoFar): WaitingLimit[] {
  return reportedLimits(run).filter(({ use }) => holdsNothing(use));
}

/** Messages that arrived and were delivered, summed over some seconds. */
interface Flow {
  seconds: number;
  arrivals: number;
  delivered: number;
}

/** What one pass over the snapshots found about a limit's backlog. */
interface BacklogTally {
  /** Seconds in which the limit ran out. */
  readonly out: SecondsTally;
  /** Seconds that ended with messages waiting, or emptied a backlog. */
  readonly backlog: SecondsTally;
  /** Whether the second before the current one ended with messages waiting. */
  waitingBefore: boolean;
  /** The first index of the current unbroken run with the limit out. */
  outRunStart: number | undefined;
  /** `outRunStart` at the first second with a backlog. */
  causeStart: number | undefined;
  /** The last index of the run that `causeStart` begins, once it's set. */
  causeRunLast: number;
  /** The most messages waiting at once, and the first second it came in. */
  peak: number;
  peakIndex: number;
  /** Over the seconds with a backlog so far, and up to the peak's. */
  readonly flow: Flow;
  peakFlow: Flow;
  /** The slowest delivery in the seconds with a backlog: exact. */
  slowestMs: number;
  /** The highest p99 of one of those seconds: a bucket's upper bound. */
  highestP99Ms: number;
  /** Over every second: messages accepted, and delivered. */
  accepted: number;
  delivered: number;
}

function tallyBacklog(limit: WaitingLimit, run: RunSoFar): BacklogTally {
  const tally: BacklogTally = {
    out: noSeconds(),
    backlog: noSeconds(),
    waitingBefore: false,
    outRunStart: undefined,
    causeStart: undefined,
    causeRunLast: 0,
    peak: 0,
    peakIndex: 0,
    flow: { seconds: 0, arrivals: 0, delivered: 0 },
    peakFlow: { seconds: 0, arrivals: 0, delivered: 0 },
    slowestMs: 0,
    highestP99Ms: 0,
    accepted: 0,
    delivered: 0,
  };
  const ref = { componentId: limit.componentId, name: limit.use.name };
  run.snapshots.forEach((snapshot, index) => {
    const metrics = snapshot.components[limit.componentId];
    if (metrics === undefined) return;
    addOutSecond(tally, { index, out: exhaustedIn(snapshot, ref) });
    addBacklogSecond(tally, { index, metrics });
  });
  return tally;
}

/** One second of the limit: whether it ran out. */
interface OutSecond {
  readonly index: number;
  readonly out: boolean;
}

function addOutSecond(tally: BacklogTally, { index, out }: OutSecond): void {
  if (!out) {
    tally.outRunStart = undefined;
    return;
  }
  tally.outRunStart ??= index;
  addSecond(tally.out, index);
  if (tally.causeStart === tally.outRunStart) tally.causeRunLast = index;
}

/** One second of the component's metrics. */
interface MetricsSecond {
  readonly index: number;
  readonly metrics: ComponentMetrics;
}

/** Counts every second's messages, and reads the seconds with a backlog. */
function addBacklogSecond(tally: BacklogTally, second: MetricsSecond): void {
  const { index, metrics } = second;
  tally.accepted += metrics.completed;
  tally.delivered += metrics.asyncSucceeded;
  const waiting = metrics.queueDepth > 0;
  const emptied = tally.waitingBefore;
  tally.waitingBefore = waiting;
  if (!waiting && !emptied) return;
  if (tally.backlog.first === undefined) startBacklog(tally, index);
  addSecond(tally.backlog, index);
  addFlow(tally, metrics);
  if (metrics.peakQueueDepth > tally.peak) setPeak(tally, second);
  addLatency(tally, metrics);
}

function addLatency(tally: BacklogTally, metrics: ComponentMetrics): void {
  const latency = metrics.asyncLatency;
  tally.slowestMs = Math.max(tally.slowestMs, latency?.maxMs ?? 0);
  tally.highestP99Ms = Math.max(tally.highestP99Ms, latency?.p99Ms ?? 0);
}

/** The first second with a backlog: where the limit's run out began. */
function startBacklog(tally: BacklogTally, index: number): void {
  tally.causeStart = tally.outRunStart;
  if (tally.causeStart !== undefined) tally.causeRunLast = index;
}

function addFlow({ flow }: BacklogTally, metrics: ComponentMetrics): void {
  flow.seconds++;
  flow.arrivals += metrics.arrivals;
  flow.delivered += metrics.asyncSucceeded;
}

function setPeak(tally: BacklogTally, { index, metrics }: MetricsSecond): void {
  tally.peak = metrics.peakQueueDepth;
  tally.peakIndex = index;
  tally.peakFlow = { ...tally.flow };
}

const SEVERITIES: Readonly<Record<BacklogState, Severity>> = {
  emptied: "note",
  waiting: "warning",
  "waiting-so-far": "note",
};

/** Everything a finding is built from. */
interface BacklogFindingInput {
  readonly limit: WaitingLimit;
  readonly tally: BacklogTally;
  /** From the first second with a backlog to the last. */
  readonly window: TimeWindow;
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
}

function backlogFinding(input: BacklogFindingInput): DetectedFinding {
  const { limit, window, run, catalog } = input;
  const { componentId } = limit;
  const end = endOf(input);
  return {
    key: findingKey({ kind: BACKLOG, componentId, limitName: limit.use.name }),
    severity: lookup(SEVERITIES, end.state),
    limitNames: [limit.use.name],
    window,
    causeWindow: causeWindowOf(input),
    summary: summaryOf({ input, end }),
    reasons: [
      busyStatement(input),
      peakStatement(input),
      ...latencyStatements(input),
      ...endStatements({ input, end }),
    ],
    evidence: [...evidenceOf(input), ...endEvidence({ input, end })],
    ...adviceFor(catalog, {
      project: run.project,
      componentId,
      limitNames: [limit.use.name],
    }),
    explains: { componentId, limitName: limit.use.name },
    // Messages never delivered are work lost to the run; a backlog that
    // emptied delayed work it doesn't count.
    affected: end.state === "waiting" ? end.waiting : undefined,
  };
}

/** How the backlog stood at the last snapshot. */
interface BacklogEnd {
  readonly state: BacklogState;
  /** Messages waiting at the end of the last second. */
  readonly waiting: number;
  /** Messages a consumer was delivering then: the limit's slots held. */
  readonly beingDelivered: number;
}

function endOf({ limit, run }: BacklogFindingInput): BacklogEnd {
  const last = run.snapshots.at(-1);
  const waiting = last?.components[limit.componentId]?.queueDepth ?? 0;
  const ref = { componentId: limit.componentId, name: limit.use.name };
  const beingDelivered = limitUseIn(last, ref)?.current ?? 0;
  return { state: stateOf(run, waiting), waiting, beingDelivered };
}

function stateOf(run: RunSoFar, waiting: number): BacklogState {
  if (waiting === 0) return "emptied";
  return runFinished(run) ? "waiting" : "waiting-so-far";
}

/** From where the limit ran out, if that's before the first backlog. */
function causeWindowOf({
  tally,
  window,
  run,
}: BacklogFindingInput): TimeWindow | undefined {
  const start = tally.causeStart;
  if (start === undefined || start === tally.backlog.first) return undefined;
  return { fromMs: run.snapshots[start]?.startMs ?? 0, toMs: window.toMs };
}

/** A finding's input and how its backlog ended, for the end's statements. */
interface EndInput {
  readonly input: BacklogFindingInput;
  readonly end: BacklogEnd;
}

function summaryOf({ input, end }: EndInput): BacklogStatement {
  const { limit, window } = input;
  return {
    kind: "backlog",
    componentId: limit.componentId,
    limitName: limit.use.name,
    state: end.state,
    window,
    waiting: end.waiting,
  };
}

/**
 * The unbroken run of seconds with the limit out that led into the first
 * backlog, and how many other seconds it was out; or, if the limit wasn't
 * out then, every second it was.
 */
function busyStatement(input: BacklogFindingInput): BacklogStatement {
  const { limit, tally, run } = input;
  const busy = {
    componentId: limit.componentId,
    limitName: limit.use.name,
    limit: limit.use.limit,
  };
  const start = tally.causeStart;
  if (start === undefined) {
    return { kind: "consumers-busy", ...busy, seconds: tally.out.count };
  }
  const window = spanOf({
    snapshots: run.snapshots,
    first: start,
    last: tally.causeRunLast,
  });
  const otherSeconds = tally.out.count - causeRunLength(tally);
  return { kind: "consumers-busy-run", ...busy, window, otherSeconds };
}

/** Seconds in the run that `causeStart` begins; 0 if it isn't set. */
function causeRunLength(tally: BacklogTally): number {
  if (tally.causeStart === undefined) return 0;
  return tally.causeRunLast - tally.causeStart + 1;
}

/**
 * The peak and when it came, and the mean flow over the seconds with a
 * backlog up to it: arrivals over deliveries is how fast it grew.
 */
function peakStatement({
  tally,
  window,
  run,
}: BacklogFindingInput): BacklogStatement {
  const { seconds, arrivals, delivered } = tally.peakFlow;
  return {
    kind: "backlog-peak",
    peak: tally.peak,
    peakEndMs: run.snapshots[tally.peakIndex]?.endMs ?? 0,
    fromMs: window.fromMs,
    arrivalsPerSec: arrivals / seconds,
    deliveredPerSec: delivered / seconds,
    growthPerSec: (arrivals - delivered) / seconds,
  };
}

/** The slowest delivery, exact, and the highest p99 of a second, a bound. */
function latencyStatements({ tally }: BacklogFindingInput): BacklogStatement[] {
  if (tally.slowestMs === 0) return [];
  return [
    {
      kind: "backlog-latency",
      slowestMs: tally.slowestMs,
      highestP99Ms: tally.highestP99Ms,
    },
  ];
}

/**
 * For messages still waiting, how the accepted ones add up: delivered,
 * waiting, and being delivered (the CLI's Components note for queues).
 */
function endStatements({ input, end }: EndInput): BacklogStatement[] {
  if (end.state === "emptied") return [];
  return [
    {
      kind: "backlog-at-end",
      componentId: input.limit.componentId,
      finished: end.state === "waiting",
      waiting: end.waiting,
      accepted: input.tally.accepted,
      delivered: input.tally.delivered,
      beingDelivered: end.beingDelivered,
    },
  ];
}

function evidenceOf(input: BacklogFindingInput): Evidence[] {
  return [
    ...limitEvidence(input),
    ...flowEvidence(input),
    ...deliveryEvidence(input),
  ];
}

/** The limit, and the seconds it was out. */
function limitEvidence({ limit, tally }: BacklogFindingInput): Evidence[] {
  const name = `${limit.componentId} ${limit.use.name}`;
  return [
    { what: `${name}: the limit`, value: limit.use.limit, source: "config" },
    {
      what: `${name}: seconds in which it ran out (limitExhausted on the second's peak)`,
      value: tally.out.count,
      source: "snapshots",
    },
    {
      what: `${name}: seconds in the unbroken run out that leads into the first with a backlog`,
      value: causeRunLength(tally),
      source: "snapshots",
    },
  ];
}

/** The backlog's seconds, its peak, the flow up to it, and its deliveries. */
function flowEvidence({ limit, tally }: BacklogFindingInput): Evidence[] {
  const { seconds, arrivals, delivered } = tally.peakFlow;
  const toPeak = "summed over the seconds with a backlog, up to the peak's";
  const read: readonly (readonly [string, number])[] = [
    [
      "seconds with a backlog (queueDepth > 0 at the end, or at the end of the second before)",
      tally.backlog.count,
    ],
    ["the highest peakQueueDepth", tally.peak],
    ["seconds with a backlog, up to the peak's", seconds],
    [`arrivals, ${toPeak}`, arrivals],
    [`asyncSucceeded, ${toPeak}`, delivered],
  ];
  return read.map(([what, value]) => ({
    what: `${limit.componentId}: ${what}`,
    value,
    source: "snapshots",
  }));
}

/** The slowest delivery and the highest p99, in the seconds with a backlog. */
function deliveryEvidence({ limit, tally }: BacklogFindingInput): Evidence[] {
  const id = limit.componentId;
  return [
    {
      what: `${id}: the slowest delivery, in ms (max of asyncLatency.maxMs over the seconds with a backlog)`,
      value: tally.slowestMs,
      source: "snapshots",
    },
    {
      what: `${id}: the highest asyncLatency.p99Ms of a second with a backlog, in ms`,
      value: tally.highestP99Ms,
      source: "snapshots",
    },
  ];
}

/** The numbers the end's statement adds up, when messages are waiting. */
function endEvidence({ input, end }: EndInput): Evidence[] {
  if (end.state === "emptied") return [];
  const id = input.limit.componentId;
  return [
    {
      what: `${id}: messages accepted (completed)`,
      value: input.tally.accepted,
      source: "totals",
    },
    {
      what: `${id}: messages delivered (asyncSucceeded)`,
      value: input.tally.delivered,
      source: "totals",
    },
    {
      what: `${id}: messages waiting (queueDepth at the end of the last second)`,
      value: end.waiting,
      source: "snapshots",
    },
    {
      what: `${id} ${input.limit.use.name}: slots held at the end of the last second`,
      value: end.beingDelivered,
      source: "snapshots",
    },
  ];
}
