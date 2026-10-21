import type { EventQueue } from "../engine/event-queue";
import { HeapEventQueue } from "../engine/heap-event-queue";
import type { StepAction } from "../model/project";
import { sample } from "../random/distribution";
import { type RandomSource } from "../random/random-source";
import { SeededRandom } from "../random/seeded-random";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type {
  ComponentBehavior,
  DispatchedEffect,
  Effect,
  RejectedEffect,
  StartedEffect,
} from "./component-behavior";
import type { ComponentDefinition } from "./component-definition";
import {
  checkLimits,
  checkRejection,
  type LimitReading,
} from "./contract-limit-checks";

export const MAX_VIOLATIONS = 20;

/** How often each outcome happened, to confirm the scenario stressed the component. */
export interface ContractStats {
  started: number;
  queued: number;
  rejected: number;
  dispatched: number;
}

type Phase = "arriving" | "queued" | "started" | "finished" | "rejected";
/** Where a finished request's async work stands (queue-like types only). */
type Delivery = "waiting" | "in-flight" | "delivered";

interface Tracked {
  phase: Phase;
  delivery?: Delivery;
}

/** What the harness schedules, playing the engine's part. */
type HarnessScheduledWork =
  HarnessRequestDue | HarnessVisitServiceDone | HarnessDeliveryFinished;

interface HarnessRequestDue {
  readonly kind: "request-due";
  readonly request: number;
  readonly action: StepAction;
}

interface HarnessVisitServiceDone {
  readonly kind: "visit-service-done";
  readonly request: number;
}

interface HarnessDeliveryFinished {
  readonly kind: "delivery-finished";
  readonly request: number;
  readonly succeeded: boolean;
}

/** Arrivals come in two bursts of `requests / 2`, `quietMs` apart. */
interface ArrivalPlan {
  readonly requests: number;
  readonly meanGapMs: number;
  readonly quietMs: number;
}

/** `ContractInput` with the defaults filled in. */
export interface ContractScenario {
  readonly seed: number;
  readonly arrivals: ArrivalPlan;
  readonly maxHoldMs: number;
  readonly dispatchFailureRate: number;
}

export interface ContractHarnessInput<Config> {
  readonly definition: ComponentDefinition<Config>;
  readonly config: Config;
  readonly scenario: ContractScenario;
}

export interface ContractHarnessDependencies<Config> {
  readonly definition: ComponentDefinition<Config>;
  readonly scenario: ContractScenario;
  /** The component under test, built from `definition`. */
  readonly behavior: ComponentBehavior<number>;
  readonly events: EventQueue<HarnessScheduledWork>;
  /** Separate from the component's source, so the harness's draws don't change the component's. */
  readonly random: RandomSource;
}

export interface ScenarioResult {
  violations: string[];
  log: string[];
  stats: ContractStats;
}

/** Checks an effect against its request's state, then advances the state. */
type EffectCheck = (state: Tracked) => void;

/** A request leaving the `arriving` phase for `to`. */
interface PhaseChange {
  readonly request: number;
  readonly state: Tracked;
  readonly to: Phase;
}

/** What a component reports about itself, next to what its effects imply. */
interface GaugeComparison {
  readonly name: string;
  readonly reported: number;
  readonly implied: number;
}

/** The `inProgress` and `queueDepth` a component's effects imply. */
interface Load {
  readonly inProgress: number;
  readonly queueDepth: number;
}

/** Builds a harness for one run of the scenario, with a fresh behavior. */
export function createContractHarness<Config>({
  definition,
  config,
  scenario,
}: ContractHarnessInput<Config>): ContractHarness<Config> {
  return new ContractHarness({
    definition,
    scenario,
    behavior: definition.build<number>(config, {
      random: new SeededRandom(scenario.seed + 1),
    }),
    events: new HeapEventQueue<HarnessScheduledWork>(),
    random: new SeededRandom(scenario.seed),
  });
}

/**
 * One run of the contract scenario. Plays the engine's part against a fresh
 * behavior, logs every effect it returns, and records the rules it breaks.
 *
 * It has its own small event loop instead of running the real engine
 * (`Simulation`). The contract checks a component on its own: if it ran
 * through the engine, an engine bug could hide a component bug, or blame the
 * component for the engine's mistake. The loop only does what the contract
 * needs (arrivals, finishes after a random hold, and async deliveries that
 * sometimes fail), so it stays small enough to trust by reading.
 */
export class ContractHarness<Config> {
  private readonly definition: ComponentDefinition<Config>;
  private readonly scenario: ContractScenario;
  private readonly random: RandomSource;
  private readonly behavior: ComponentBehavior<number>;
  private readonly events: EventQueue<HarnessScheduledWork>;
  private readonly tracked = new Map<number, Tracked>();
  private readonly violations: string[] = [];
  private readonly log: string[] = [];
  private readonly stats = emptyStats();
  private readonly maxEvents: number;
  private lastCounters: Readonly<Record<string, number>> = {};
  private lastLimits: LimitReading | undefined;
  private nowMs = 0;
  private handled = 0;
  /** Set when the behavior can't go on; skips the end-of-run checks. */
  private aborted = false;

  constructor({
    definition,
    scenario,
    behavior,
    events,
    random,
  }: ContractHarnessDependencies<Config>) {
    this.definition = definition;
    this.scenario = scenario;
    this.behavior = behavior;
    this.events = events;
    this.random = random;
    this.maxEvents = scenario.arrivals.requests * 1000;
  }

  run(): ScenarioResult {
    this.scheduleArrivals();
    this.handleEvents();
    if (!this.aborted) this.checkEnd();
    return { violations: this.violations, log: this.log, stats: this.stats };
  }

  private scheduleArrivals(): void {
    const { requests, meanGapMs, quietMs } = this.scenario.arrivals;
    const { actions } = this.definition;
    let timeMs = 0;
    for (let request = 0; request < requests; request++) {
      if (request === Math.floor(requests / 2)) timeMs += quietMs;
      timeMs += sample({ kind: "exponential", meanMs: meanGapMs }, this.random);
      const action =
        actions[Math.floor(this.random.next() * actions.length)] ?? "invoke";
      this.events.schedule(timeMs, { kind: "request-due", request, action });
    }
  }

  private handleEvents(): void {
    for (
      let next = this.events.pop();
      next !== undefined;
      next = this.events.pop()
    ) {
      this.handled++;
      if (this.handled > this.maxEvents) return;
      if (this.violations.length >= MAX_VIOLATIONS) return;
      this.nowMs = next.timeMs;
      handleKind(this.eventHandlers, next.payload);
      if (this.aborted) return;
      this.checkGauges();
      this.checkExtraMetrics();
    }
  }

  /** What the harness does when each piece of scheduled work comes due. */
  private readonly eventHandlers: KindHandlers<HarnessScheduledWork, void> = {
    "request-due": (event) => {
      this.arrive(event);
    },
    "visit-service-done": (event) => {
      this.finish(event);
    },
    "delivery-finished": (event) => {
      this.dispatchFinished(event);
    },
  };

  private arrive({ request, action }: HarnessRequestDue): void {
    const state: Tracked = { phase: "arriving" };
    this.tracked.set(request, state);
    this.apply(this.behavior.arrive({ request, action, nowMs: this.nowMs }));
    if (state.phase !== "arriving") return;
    this.violate(
      request,
      "arrive() gave no outcome (started, queued, or rejected).",
    );
    state.phase = "rejected";
  }

  private finish({ request }: HarnessVisitServiceDone): void {
    const state = this.tracked.get(request);
    if (state !== undefined) {
      state.phase = "finished";
      if (this.definition.deliversAsync) state.delivery = "waiting";
    }
    this.apply(this.behavior.finish({ request, nowMs: this.nowMs }));
  }

  private dispatchFinished({
    request,
    succeeded,
  }: HarnessDeliveryFinished): void {
    const state = this.tracked.get(request);
    if (state !== undefined)
      state.delivery = succeeded ? "delivered" : "waiting";
    if (this.behavior.dispatchFinished === undefined) {
      this.violate(
        request,
        "deliversAsync is set, but there's no dispatchFinished().",
      );
      this.aborted = true;
      return;
    }
    this.apply(
      this.behavior.dispatchFinished({ request, succeeded, nowMs: this.nowMs }),
    );
  }

  private apply(effects: Effect<number>[]): void {
    for (const effect of effects) this.checkEffect(effect);
  }

  private checkEffect(effect: Effect<number>): void {
    this.log.push(describeEffect(this.nowMs, effect));
    const state = this.tracked.get(effect.request);
    if (state === undefined) {
      this.violate(
        effect.request,
        `"${effect.kind}" for a request that never arrived.`,
      );
      return;
    }
    handleKind(this.effectChecks, effect)(state);
  }

  /** The rules for each kind of effect a component returns. */
  private readonly effectChecks: KindHandlers<Effect<number>, EffectCheck> = {
    started: (effect) => (state) => {
      this.start(effect, state);
    },
    queued:
      ({ request }) =>
      (state) => {
        this.stats.queued++;
        this.leaveArriving({ request, state, to: "queued" });
      },
    rejected: (effect) => (state) => {
      this.stats.rejected++;
      this.leaveArriving({ request: effect.request, state, to: "rejected" });
      this.checkRejection(effect);
    },
    dispatched: (effect) => (state) => {
      this.dispatch(effect, state);
    },
  };

  private start(
    { request, serviceMs }: StartedEffect<number>,
    state: Tracked,
  ): void {
    this.stats.started++;
    if (state.phase !== "arriving" && state.phase !== "queued") {
      this.violate(request, `started while ${state.phase}.`);
      return;
    }
    if (!Number.isFinite(serviceMs) || serviceMs < 0) {
      this.violate(request, `invalid serviceMs ${String(serviceMs)}.`);
      return;
    }
    state.phase = "started";
    const holdMs = this.random.next() * this.scenario.maxHoldMs;
    this.events.schedule(this.nowMs + serviceMs + holdMs, {
      kind: "visit-service-done",
      request,
    });
  }

  /** Queueing and rejecting are both only allowed on arrival. */
  private leaveArriving({ request, state, to }: PhaseChange): void {
    if (state.phase !== "arriving") {
      this.violate(request, `${to} while ${state.phase}.`);
      return;
    }
    state.phase = to;
  }

  /** A rejection must come from a full limit that declares its reason. */
  private checkRejection({ request, reason }: RejectedEffect<number>): void {
    const problems = checkRejection({
      limits: this.behavior.limits ?? [],
      nowMs: this.nowMs,
      reason,
      rejectionReasons: this.definition.rejectionReasons,
    });
    for (const problem of problems) this.violate(request, problem);
  }

  private dispatch(
    { request }: DispatchedEffect<number>,
    state: Tracked,
  ): void {
    this.stats.dispatched++;
    if (!this.definition.deliversAsync) {
      this.violate(
        request,
        "dispatched, but the definition doesn't set deliversAsync.",
      );
      return;
    }
    if (state.phase !== "finished" || state.delivery !== "waiting") {
      this.violate(request, `dispatched while ${describeTracked(state)}.`);
      return;
    }
    state.delivery = "in-flight";
    const deliveryMs = this.random.next() * this.scenario.maxHoldMs;
    const succeeded = this.random.next() >= this.scenario.dispatchFailureRate;
    this.events.schedule(this.nowMs + deliveryMs, {
      kind: "delivery-finished",
      request,
      succeeded,
    });
  }

  private checkGauges(): void {
    const implied = impliedLoad(this.tracked.values());
    this.compareGauge({
      name: "inProgress",
      reported: this.behavior.inProgress,
      implied: implied.inProgress,
    });
    this.compareGauge({
      name: "queueDepth",
      reported: this.behavior.queueDepth,
      implied: implied.queueDepth,
    });
  }

  private compareGauge({ name, reported, implied }: GaugeComparison): void {
    if (reported === implied) return;
    this.violate(
      undefined,
      `${name} is ${String(reported)}; the effects imply ${String(implied)}.`,
    );
  }

  /** Type-specific `gauges`, `counters`, and `limits`. */
  private checkExtraMetrics(): void {
    this.checkTypeGauges();
    this.checkCounters();
    this.checkLimits();
  }

  private checkTypeGauges(): void {
    for (const [name, value] of Object.entries(this.behavior.gauges ?? {})) {
      if (Number.isFinite(value)) continue;
      this.violate(undefined, `gauge ${name} is ${String(value)}.`);
    }
  }

  private checkCounters(): void {
    const counters = this.behavior.counters ?? {};
    for (const [name, value] of Object.entries(counters)) {
      const last = this.lastCounters[name] ?? 0;
      if (Number.isFinite(value) && value >= last) continue;
      this.violate(
        undefined,
        `counter ${name} went from ${String(last)} to ${String(value)}.`,
      );
    }
    this.lastCounters = { ...counters };
  }

  private checkLimits(): void {
    const { problems, reading } = checkLimits({
      limits: this.behavior.limits ?? [],
      nowMs: this.nowMs,
      previous: this.lastLimits,
      rejectionReasons: this.definition.rejectionReasons,
    });
    for (const problem of problems) this.violate(undefined, problem);
    this.lastLimits = reading;
  }

  /** After the last event: all work must have drained. */
  private checkEnd(): void {
    if (this.handled > this.maxEvents) {
      this.violate(
        undefined,
        `still busy after ${String(this.maxEvents)} events; work never drains.`,
      );
    }
    for (const [request, state] of this.tracked) {
      if (this.violations.length >= MAX_VIOLATIONS) return;
      this.checkSettled(request, state);
    }
  }

  private checkSettled(request: number, state: Tracked): void {
    if (state.phase === "queued") {
      this.violate(request, "queued but never started.");
    }
    if (state.delivery === "waiting" || state.delivery === "in-flight") {
      this.violate(request, "async work never delivered.");
    }
  }

  private violate(request: number | undefined, message: string): void {
    const who = request === undefined ? "" : ` request ${String(request)}`;
    this.violations.push(`t=${this.nowMs.toFixed(3)}ms${who}: ${message}`);
  }
}

function impliedLoad(states: Iterable<Tracked>): Load {
  let inProgress = 0;
  let queueDepth = 0;
  for (const state of states) {
    if (state.phase === "started") inProgress++;
    if (state.phase === "queued" || state.delivery === "waiting") queueDepth++;
  }
  return { inProgress, queueDepth };
}

function describeTracked({ phase, delivery }: Tracked): string {
  return delivery === undefined ? phase : `${phase}, ${delivery}`;
}

/** The part of an effect's log line after its request. */
const EFFECT_DETAILS: KindHandlers<Effect<number>, string> = {
  started: ({ serviceMs }) => ` ${String(serviceMs)}`,
  rejected: ({ reason }) => ` ${reason}`,
  queued: () => "",
  dispatched: () => "",
};

function describeEffect(nowMs: number, effect: Effect<number>): string {
  const detail = handleKind(EFFECT_DETAILS, effect);
  return `${String(nowMs)} ${effect.kind} ${String(effect.request)}${detail}`;
}

export function emptyStats(): ContractStats {
  return { started: 0, queued: 0, rejected: 0, dispatched: 0 };
}
