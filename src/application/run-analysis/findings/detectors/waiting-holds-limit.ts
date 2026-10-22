import type { WhenFull } from "../../../../domain/components/component-behavior";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import {
  handleKind,
  type KindHandlers,
} from "../../../../domain/shared/kind-handlers";
import type { RunSoFar } from "../../run-so-far";
import { adviceFor, type FindingsCatalog } from "../catalog/type-advice";
import type { Detector } from "../detector";
import type { DetectedFinding, Evidence, TimeWindow } from "../finding";
import { findingKey } from "../finding-key";
import {
  amountOf,
  exhaustedIn,
  limitUseIn,
  reportedLimits,
  type LimitRef,
} from "../limit-ref";
import {
  at,
  component,
  count,
  duration,
  plural,
  say,
  type Message,
} from "../message";
import {
  addSecond,
  noSeconds,
  spanOf,
  spanOfTally,
  type SecondsTally,
} from "../time-window";

export const WAITING_HOLDS_LIMIT = "waiting-holds-limit";

/**
 * A cause note for each limit that makes work wait, declares that its
 * waiting work holds another limit, and ran out (findings.md §2.1): RDS
 * `queryWorkers`, whose waiting queries hold `connections`. It explains the
 * held limit, so it shows beneath the finding about that limit's refusals,
 * and on its own if the held limit never ran out.
 *
 * Its `window` is the seconds in which both limits were out, or, if the held
 * one never was, the seconds the waiting limit was out. Its `causeWindow`
 * starts where the waiting began: the first second of the unbroken run of
 * seconds with the waiting limit out that leads into the held limit's first.
 */
export function waitingHoldsLimitDetector(catalog: FindingsCatalog): Detector {
  return {
    id: WAITING_HOLDS_LIMIT,
    detect: (run) =>
      heldPairs(run).flatMap((pair) => {
        const tally = tallyWaiting(pair, run);
        const busy = spanOfTally(run.snapshots, tally.full);
        if (busy === undefined) return [];
        return [waitingFinding({ pair, tally, busy, run, catalog })];
      }),
  };
}

/** A limit that makes work wait, and the limit its waiting work holds. */
interface HeldPair {
  readonly componentId: string;
  readonly waiting: LimitUse;
  readonly held: LimitUse;
}

/** The name of the limit that waiting work holds, by the declaration. */
const HOLDS: KindHandlers<WhenFull, string | undefined> = {
  refuse: () => undefined,
  wait: ({ holds }) => holds,
};

function heldPairs(run: RunSoFar): HeldPair[] {
  const limits = reportedLimits(run);
  return limits.flatMap(({ componentId, use }) => {
    const heldName = handleKind(HOLDS, use.whenFull);
    const held = limits.find(
      (l) => l.componentId === componentId && l.use.name === heldName,
    );
    if (held === undefined) return [];
    return [{ componentId, waiting: use, held: held.use }];
  });
}

/** Requests a component finished and received, summed over some seconds. */
interface Flow {
  completed: number;
  arrivals: number;
}

/** What one pass over the snapshots found about a pair of limits. */
interface WaitingTally {
  /** Seconds in which the waiting limit was out. */
  readonly full: SecondsTally;
  /** Seconds in which both were out. */
  readonly both: SecondsTally;
  readonly fullFlow: Flow;
  readonly bothFlow: Flow;
  /** The first index of the current unbroken run with the waiting limit out. */
  runStart: number | undefined;
  /** `runStart` at the first second with both out: when the waiting began. */
  causeStart: number | undefined;
  /** The last index of the run that `causeStart` begins, once it's set. */
  causeRunLast: number;
  /** The most requests waiting at once, while the waiting limit was out. */
  waitingPeak: number;
  /** The held limit's highest peak, while the waiting limit was out. */
  heldPeak: number;
}

/** One second of the run, for one pair. */
interface PairSecond {
  readonly snapshot: MetricsSnapshot;
  readonly index: number;
  readonly pair: HeldPair;
}

function tallyWaiting(pair: HeldPair, run: RunSoFar): WaitingTally {
  const tally: WaitingTally = {
    full: noSeconds(),
    both: noSeconds(),
    fullFlow: { completed: 0, arrivals: 0 },
    bothFlow: { completed: 0, arrivals: 0 },
    runStart: undefined,
    causeStart: undefined,
    causeRunLast: 0,
    waitingPeak: 0,
    heldPeak: 0,
  };
  run.snapshots.forEach((snapshot, index) => {
    addPairSecond(tally, { snapshot, index, pair });
  });
  return tally;
}

function addPairSecond(tally: WaitingTally, second: PairSecond): void {
  const { snapshot, index, pair } = second;
  const metrics = snapshot.components[pair.componentId];
  if (metrics === undefined || !exhaustedIn(snapshot, waitingRef(pair))) {
    tally.runStart = undefined;
    return;
  }
  tally.runStart ??= index;
  addSecond(tally.full, index);
  addFlow(tally.fullFlow, metrics);
  tally.waitingPeak = Math.max(tally.waitingPeak, metrics.peakQueueDepth);
  const heldUse = limitUseIn(snapshot, heldRef(pair));
  tally.heldPeak = Math.max(tally.heldPeak, heldUse?.peak ?? 0);
  if (exhaustedIn(snapshot, heldRef(pair))) addBothSecond(tally, second);
  if (tally.causeStart === tally.runStart) tally.causeRunLast = index;
}

/** A second with both limits out, the first of which says where waiting began. */
function addBothSecond(
  tally: WaitingTally,
  { snapshot, index, pair }: PairSecond,
): void {
  tally.causeStart ??= tally.runStart;
  addSecond(tally.both, index);
  const metrics = snapshot.components[pair.componentId];
  if (metrics !== undefined) addFlow(tally.bothFlow, metrics);
}

/** Seconds in the run that `causeStart` begins; 0 if it isn't set. */
function causeRunLength(tally: WaitingTally): number {
  if (tally.causeStart === undefined) return 0;
  return tally.causeRunLast - tally.causeStart + 1;
}

function addFlow(flow: Flow, metrics: Flow): void {
  flow.completed += metrics.completed;
  flow.arrivals += metrics.arrivals;
}

function waitingRef({ componentId, waiting }: HeldPair): LimitRef {
  return { componentId, name: waiting.name };
}

function heldRef({ componentId, held }: HeldPair): LimitRef {
  return { componentId, name: held.name };
}

/** Everything a note is built from. */
interface WaitingFindingInput {
  readonly pair: HeldPair;
  readonly tally: WaitingTally;
  /** From the first second with the waiting limit out to the last. */
  readonly busy: TimeWindow;
  readonly run: RunSoFar;
  readonly catalog: FindingsCatalog;
}

function waitingFinding(input: WaitingFindingInput): DetectedFinding {
  const { pair, tally, busy, run, catalog } = input;
  const { componentId } = pair;
  const limitName = pair.waiting.name;
  const window = spanOfTally(run.snapshots, tally.both) ?? busy;
  return {
    key: findingKey({ kind: WAITING_HOLDS_LIMIT, componentId, limitName }),
    severity: "note",
    limitNames: [pair.waiting.name],
    window,
    causeWindow: causeWindowOf(input, window),
    summary: say`Requests waited for ${component(pair.componentId)}'s ${pair.waiting.name}, holding its ${pair.held.name} while they waited.`,
    reasons: [
      busySentence(input),
      holdsSentence(input),
      heldSentence(input),
      flowSentence(input),
    ],
    evidence: evidenceOf(input),
    ...adviceFor(catalog, {
      project: run.project,
      componentId: pair.componentId,
      limitNames: [pair.waiting.name],
    }),
    explains: { componentId: pair.componentId, limitName: pair.held.name },
    // A note counts nothing: the failures it explains are counted once.
    affected: undefined,
  };
}

/** From where the waiting began, if that's before the held limit ran out. */
function causeWindowOf(
  { tally, run }: WaitingFindingInput,
  window: TimeWindow,
): TimeWindow | undefined {
  const start = tally.causeStart;
  if (start === undefined || start === tally.both.first) return undefined;
  return { fromMs: run.snapshots[start]?.startMs ?? 0, toMs: window.toMs };
}

/**
 * The unbroken run of seconds that led into the held limit's refusals, and
 * how many other seconds the waiting limit was out; or, if the held limit
 * never ran out, every second it was.
 */
function busySentence(input: WaitingFindingInput): Message {
  const { pair, tally, busy, run } = input;
  const all = say`All ${count(pair.waiting.limit)} of its ${pair.waiting.name} were busy`;
  const start = tally.causeStart;
  if (start === undefined) {
    const n = tally.full.count;
    return say`${all} in ${count(n)} ${plural(n, ["second", "seconds"])} from ${at(busy.fromMs)} to ${at(busy.toMs)}, so requests arriving then waited for one.`;
  }
  const span = spanOf({
    snapshots: run.snapshots,
    first: start,
    last: tally.causeRunLast,
  });
  const other = tally.full.count - causeRunLength(tally);
  const during = say`${all} in every second from ${at(span.fromMs)} to ${at(span.toMs)}, so requests arriving then waited for one.`;
  if (other === 0) return during;
  return say`${during} They were also all busy in ${count(other)} other ${plural(other, ["second", "seconds"])}.`;
}

function holdsSentence({ pair, tally }: WaitingFindingInput): Message {
  const running = pair.waiting.limit;
  return say`Each waiting request holds one of its ${pair.held.name}: ${count(running)} running and up to ${count(tally.waitingPeak)} waiting is ${count(running + tally.waitingPeak)}, and its ${pair.held.name} peaked at ${amountOf(pair.held, tally.heldPeak)}.`;
}

/**
 * When the held limit ran out while the waiting one was out too, and how
 * long after the waiting began. It reads only those seconds: a held limit
 * that runs out on its own isn't this note's.
 */
function heldSentence(input: WaitingFindingInput): Message {
  const { pair, tally, run } = input;
  const out = spanOfTally(run.snapshots, tally.both);
  const busy = say`while its ${pair.waiting.name} were all busy`;
  if (out === undefined) {
    return say`Its ${pair.held.name} never ran out ${busy}.`;
  }
  const n = tally.both.count;
  const ranOut = say`Its ${pair.held.name} ran out ${busy} in ${count(n)} ${plural(n, ["second", "seconds"])} from ${at(out.fromMs)} to ${at(out.toMs)}`;
  const cause = causeWindowOf(input, out);
  if (cause === undefined) return say`${ranOut}.`;
  return say`${ranOut}, ${duration(out.fromMs - cause.fromMs)} after the waiting began at ${at(cause.fromMs)}.`;
}

/** The seconds the flow sentence covers: the window's. */
interface FlowScope {
  readonly flow: Flow;
  readonly seconds: number;
  /** The limits that were out in those seconds, for the evidence. */
  readonly limitsOut: string;
  /** The same, as the sentence says it. */
  readonly during: Message;
}

/** The seconds with both limits out, or with the waiting one, if never both. */
function flowScope({ pair, tally }: WaitingFindingInput): FlowScope {
  const { waiting, held } = pair;
  if (tally.both.count > 0) {
    return {
      flow: tally.bothFlow,
      seconds: tally.both.count,
      limitsOut: `both ${waiting.name} and ${held.name}`,
      during: say`While its ${waiting.name} were all busy and its ${held.name} were out`,
    };
  }
  return {
    flow: tally.fullFlow,
    seconds: tally.full.count,
    limitsOut: waiting.name,
    during: say`While its ${waiting.name} were all busy`,
  };
}

/** Throughput against arrivals, over the seconds the window covers. */
function flowSentence(input: WaitingFindingInput): Message {
  const { flow, seconds, during } = flowScope(input);
  return say`${during}, ${component(input.pair.componentId)} finished ${count(flow.completed / seconds)} requests a second on average, against ${count(flow.arrivals / seconds)} arriving.`;
}

function evidenceOf(input: WaitingFindingInput): Evidence[] {
  return [
    ...limitEvidence(input),
    ...secondsEvidence(input),
    ...flowEvidence(input),
  ];
}

/** The limits, and the most of each used while the waiting one was out. */
function limitEvidence({ pair, tally }: WaitingFindingInput): Evidence[] {
  const id = pair.componentId;
  const w = `${id} ${pair.waiting.name}`;
  const h = `${id} ${pair.held.name}`;
  return [
    { what: `${w}: the limit`, value: pair.waiting.limit, source: "config" },
    { what: `${h}: the limit`, value: pair.held.limit, source: "config" },
    {
      what: `${id}: the highest peakQueueDepth of a second with ${pair.waiting.name} out`,
      value: tally.waitingPeak,
      source: "snapshots",
    },
    {
      what: `${h}: the highest peak of a second with ${pair.waiting.name} out`,
      value: tally.heldPeak,
      source: "snapshots",
    },
  ];
}

/** How many seconds each limit was out, and the run that led in. */
function secondsEvidence({ pair, tally }: WaitingFindingInput): Evidence[] {
  const w = `${pair.componentId} ${pair.waiting.name}`;
  return [
    {
      what: `${w}: seconds in which it ran out (limitExhausted on the second's peak)`,
      value: tally.full.count,
      source: "snapshots",
    },
    {
      what: `${w}: seconds in the unbroken run out that leads into the first with ${pair.held.name} out too`,
      value: causeRunLength(tally),
      source: "snapshots",
    },
    {
      what: `${pair.componentId}: seconds with both ${pair.waiting.name} and ${pair.held.name} out`,
      value: tally.both.count,
      source: "snapshots",
    },
  ];
}

/** The sums the flow sentence divides, over the seconds it covers. */
function flowEvidence(input: WaitingFindingInput): Evidence[] {
  const { flow, limitsOut: out } = flowScope(input);
  const id = input.pair.componentId;
  return [
    {
      what: `${id}: completed, summed over the seconds with ${out} out`,
      value: flow.completed,
      source: "snapshots",
    },
    {
      what: `${id}: arrivals, summed over the seconds with ${out} out`,
      value: flow.arrivals,
      source: "snapshots",
    },
  ];
}
