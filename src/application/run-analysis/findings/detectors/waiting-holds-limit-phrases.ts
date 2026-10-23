import type { TimeWindow } from "../finding";
import { amountOf, type LimitSize } from "../limit-ref";
import {
  at,
  component,
  count,
  duration,
  plural,
  say,
  type Message,
} from "../message";
import type { Phrases, Statement } from "../phrase";
import { limitsOf, type Vocabulary } from "../vocabulary";

/** A limit that makes work wait, and the limit its waiting work holds. */
interface HeldPairStatement extends Statement {
  readonly componentId: string;
  readonly waitingLimit: string;
  readonly heldLimit: string;
}

/** Requests waited for the waiting limit, holding the held one. */
export interface RequestsWaitedStatement extends HeldPairStatement {
  readonly kind: "waiting-holds-limit";
}

/** What both busy statements say: the waiting limit had no slot free. */
interface WaitingLimitBusy extends Statement {
  readonly componentId: string;
  readonly limitName: string;
  readonly limit: number;
}

/** Every second the waiting limit was out, when the held one never was. */
export interface WaitingLimitBusyStatement extends WaitingLimitBusy {
  readonly kind: "waiting-limit-busy";
  readonly seconds: number;
  /** From the first of those seconds to the last. */
  readonly window: TimeWindow;
}

/** The unbroken run out that led into the held limit's running out. */
export interface WaitingLimitBusyRunStatement extends WaitingLimitBusy {
  readonly kind: "waiting-limit-busy-run";
  readonly window: TimeWindow;
  /** Seconds the waiting limit was out outside that run. */
  readonly otherSeconds: number;
}

/** Each waiting request holds one of the held limit. */
export interface WaitingHoldsStatement extends Statement {
  readonly kind: "waiting-holds";
  readonly componentId: string;
  readonly heldLimit: string;
  readonly held: LimitSize;
  /** The waiting limit's size: requests running. */
  readonly running: number;
  /** The most requests waiting at once, while the waiting limit was out. */
  readonly waitingPeak: number;
  /** The held limit's highest peak, while the waiting limit was out. */
  readonly heldPeak: number;
}

/** The held limit never ran out while the waiting one was out. */
export interface HeldNeverRanOutStatement extends HeldPairStatement {
  readonly kind: "held-never-ran-out";
}

/** The seconds the held limit ran out while the waiting one was out too. */
export interface HeldRanOutStatement extends HeldPairStatement {
  readonly kind: "held-ran-out";
  readonly seconds: number;
  readonly window: TimeWindow;
  /** Where the waiting began, if before `window`. */
  readonly waitingFromMs: number | undefined;
}

/** Throughput against arrivals, over the seconds the window covers. */
export interface WaitingFlowStatement extends Statement {
  readonly kind: "waiting-flow";
  readonly componentId: string;
  readonly waitingLimit: string;
  /** Set when the seconds are those with the held limit out too. */
  readonly heldLimit: string | undefined;
  readonly completedPerSec: number;
  readonly arrivalsPerSec: number;
}

/** Every statement waiting-holds-limit makes. */
export type WaitingHoldsLimitStatement =
  | RequestsWaitedStatement
  | WaitingLimitBusyStatement
  | WaitingLimitBusyRunStatement
  | WaitingHoldsStatement
  | HeldNeverRanOutStatement
  | HeldRanOutStatement
  | WaitingFlowStatement;

/** "All 16 of its queryWorkers were busy" */
function allBusy(s: WaitingLimitBusy, v: Vocabulary): Message {
  const limit = limitsOf(v, s.componentId)(s.limitName);
  return say`All ${count(s.limit)} of its ${limit} were busy`;
}

/** "33 seconds", "1 other second" */
function seconds(n: number, other = ""): Message {
  return say`${count(n)} ${other}${plural(n, ["second", "seconds"])}`;
}

/** "from 11 s to 49 s" */
function during({ fromMs, toMs }: TimeWindow): Message {
  return say`from ${at(fromMs)} to ${at(toMs)}`;
}

/**
 * How waiting-holds-limit words its statements, at both lengths. A detector
 * that makes them registers it as its `phrases`.
 */
export const WAITING_HOLDS_LIMIT_PHRASES: Phrases<WaitingHoldsLimitStatement> =
  {
    "waiting-holds-limit": {
      long: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        return say`Requests waited for ${component(s.componentId)}'s ${limit(s.waitingLimit)}, holding its ${limit(s.heldLimit)} while they waited.`;
      },
      short: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        return say`requests waited for ${component(s.componentId)}'s ${limit(s.waitingLimit)}, holding its ${limit(s.heldLimit)}`;
      },
    },
    "waiting-limit-busy": {
      long: (s, v) =>
        say`${allBusy(s, v)} in ${seconds(s.seconds)} ${during(s.window)}, so requests arriving then waited for one.`,
      short: (s, v) =>
        say`all ${count(s.limit)} of ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} were busy in ${seconds(s.seconds)}`,
    },
    "waiting-limit-busy-run": {
      long: (s, v) => {
        const ledIn = say`${allBusy(s, v)} in every second ${during(s.window)}, so requests arriving then waited for one.`;
        if (s.otherSeconds === 0) return ledIn;
        return say`${ledIn} They were also all busy in ${seconds(s.otherSeconds, "other ")}.`;
      },
      short: (s, v) =>
        say`all ${count(s.limit)} of ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.limitName)} were busy ${during(s.window)}`,
    },
    "waiting-holds": {
      long: (s, v) => {
        const held = limitsOf(v, s.componentId)(s.heldLimit);
        return say`Each waiting request holds one of its ${held}: ${count(s.running)} running and up to ${count(s.waitingPeak)} waiting is ${count(s.running + s.waitingPeak)}, and its ${held} peaked at ${amountOf(s.held, s.heldPeak)}.`;
      },
      short: (s, v) =>
        say`each waiting request holds one of ${component(s.componentId)}'s ${limitsOf(v, s.componentId)(s.heldLimit)}`,
    },
    "held-never-ran-out": {
      long: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        return say`Its ${limit(s.heldLimit)} never ran out while its ${limit(s.waitingLimit)} were all busy.`;
      },
      short: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        return say`${component(s.componentId)}'s ${limit(s.heldLimit)} never ran out while its ${limit(s.waitingLimit)} were all busy`;
      },
    },
    "held-ran-out": {
      long: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        const ranOut = say`Its ${limit(s.heldLimit)} ran out while its ${limit(s.waitingLimit)} were all busy in ${seconds(s.seconds)} ${during(s.window)}`;
        if (s.waitingFromMs === undefined) return say`${ranOut}.`;
        return say`${ranOut}, ${duration(s.window.fromMs - s.waitingFromMs)} after the waiting began at ${at(s.waitingFromMs)}.`;
      },
      short: (s, v) => {
        const limit = limitsOf(v, s.componentId);
        return say`${component(s.componentId)}'s ${limit(s.heldLimit)} ran out while its ${limit(s.waitingLimit)} were all busy`;
      },
    },
    "waiting-flow": {
      long: (s, v) =>
        say`${flowScope(s, v)}, ${component(s.componentId)} finished ${count(s.completedPerSec)} requests a second on average, against ${count(s.arrivalsPerSec)} arriving.`,
      short: (s) =>
        say`${component(s.componentId)} finished ${count(s.completedPerSec)} requests a second, against ${count(s.arrivalsPerSec)} arriving`,
    },
  };

/** "While its queryWorkers were all busy[ and its connections were out]" */
function flowScope(s: WaitingFlowStatement, v: Vocabulary): Message {
  const limit = limitsOf(v, s.componentId);
  const busy = say`While its ${limit(s.waitingLimit)} were all busy`;
  if (s.heldLimit === undefined) return busy;
  return say`${busy} and its ${limit(s.heldLimit)} were out`;
}
