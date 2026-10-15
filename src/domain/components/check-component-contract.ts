import { EventQueue } from "../engine/event-queue";
import type { StepAction } from "../model/project";
import { sample } from "../random/distribution";
import { SeededRandom } from "../random/random-source";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import type {
  ComponentBehavior,
  DispatchedEffect,
  Effect,
  StartedEffect,
} from "./component-behavior";
import type { ComponentDefinition } from "./component-definition";

export interface ContractOptions<Config> {
  /** Config to test with; defaults to the definition's `defaultConfig`. */
  readonly config?: Config;
  readonly seed?: number;
  /** Requests sent, in two bursts separated by a quiet period. */
  readonly requests?: number;
  /** Average gap between arrivals within a burst. Small means overload. */
  readonly meanGapMs?: number;
  /** Quiet time between the bursts, e.g. long enough for instances to go cold. */
  readonly quietMs?: number;
  /** Longest extra time a started request is held, standing in for nested calls. */
  readonly maxHoldMs?: number;
  /** Share of async deliveries that fail and must be redelivered. */
  readonly dispatchFailureRate?: number;
}

/** How often each outcome happened, to confirm the scenario stressed the component. */
export interface ContractStats {
  started: number;
  queued: number;
  rejected: number;
  dispatched: number;
}

export interface ContractReport {
  /** Broken rules, in the order they were found. Empty means the definition passed. */
  readonly violations: string[];
  readonly stats: ContractStats;
}

const MAX_VIOLATIONS = 20;

/**
 * The shared contract every component definition must pass (MVP design §3.1,
 * Liskov Substitution). It drives a component built from `definition`
 * through a random but seeded scenario, plays the engine's part, and checks
 * the rules in `ComponentBehavior`:
 *
 * - every arrival gets exactly one outcome: started, queued, or rejected;
 * - a request is started at most once, and only after arriving or queueing;
 * - every queued request is eventually started;
 * - service times are finite and not negative;
 * - async work is dispatched only by `deliversAsync` types, only after the
 *   request finished, never twice at once, and is eventually delivered;
 * - `inProgress` and `queueDepth` always match what the effects imply, so
 *   both are zero once all work drains;
 * - type-specific `gauges` and `counters` are finite, and counters never
 *   decrease;
 * - the same seed produces exactly the same effects.
 *
 * Each definition's test asserts that `violations` is empty.
 */
export function checkComponentContract<Config>(
  definition: ComponentDefinition<Config>,
  options: ContractOptions<Config> = {},
): ContractReport {
  const problems = checkDefinition(definition);
  if (problems.length > 0) return { violations: problems, stats: emptyStats() };

  const input: ContractHarnessInput<Config> = {
    definition,
    config: options.config ?? definition.defaultConfig,
    settings: scenarioSettings(options),
  };
  const first = new ContractHarness(input).run();
  const second = new ContractHarness(input).run();
  const violations =
    first.violations.length > 0
      ? first.violations
      : checkDeterminism(first.log, second.log);
  return {
    violations: violations.slice(0, MAX_VIOLATIONS),
    stats: first.stats,
  };
}

/** Problems with the definition itself, found before running anything. */
function checkDefinition<Config>(
  definition: ComponentDefinition<Config>,
): string[] {
  const problems: string[] = [];
  if (!definition.configSchema.safeParse(definition.defaultConfig).success) {
    problems.push("defaultConfig doesn't pass configSchema.");
  }
  if (definition.actions.length === 0) {
    problems.push("The definition accepts no actions.");
  }
  return problems;
}

/** Compares the effect logs of two runs with the same seed. */
function checkDeterminism(first: string[], second: string[]): string[] {
  const index = first.findIndex((line, i) => line !== second[i]);
  if (index === -1 && first.length === second.length) return [];
  const at = index === -1 ? Math.min(first.length, second.length) : index;
  return [
    `Not deterministic: two runs with the same seed differ at effect ${String(at)} ` +
      `("${first[at] ?? "(none)"}" vs "${second[at] ?? "(none)"}").`,
  ];
}

type Phase = "arriving" | "queued" | "started" | "finished" | "rejected";
/** Where a finished request's async work stands (queue-like types only). */
type Delivery = "waiting" | "in-flight" | "delivered";

interface Tracked {
  phase: Phase;
  delivery?: Delivery;
}

/** What the harness schedules, playing the engine's part. */
type HarnessEvent = ArriveEvent | FinishEvent | DispatchFinishedEvent;

interface ArriveEvent {
  readonly kind: "arrive";
  readonly request: number;
  readonly action: StepAction;
}

interface FinishEvent {
  readonly kind: "finish";
  readonly request: number;
}

interface DispatchFinishedEvent {
  readonly kind: "dispatch-finished";
  readonly request: number;
  readonly succeeded: boolean;
}

/** Arrivals come in two bursts of `requests / 2`, `quietMs` apart. */
interface ArrivalPlan {
  readonly requests: number;
  readonly meanGapMs: number;
  readonly quietMs: number;
}

/** `ContractOptions` with the defaults filled in. */
interface ScenarioSettings {
  readonly seed: number;
  readonly arrivals: ArrivalPlan;
  readonly maxHoldMs: number;
  readonly dispatchFailureRate: number;
}

interface ContractHarnessInput<Config> {
  readonly definition: ComponentDefinition<Config>;
  readonly config: Config;
  readonly settings: ScenarioSettings;
}

interface ScenarioResult {
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

/**
 * One run of the contract scenario. Plays the engine's part against a fresh
 * behavior, logs every effect it returns, and records the rules it breaks.
 */
class ContractHarness<Config> {
  private readonly definition: ComponentDefinition<Config>;
  private readonly settings: ScenarioSettings;
  /** Separate from the component's source, so the harness's draws don't change the component's. */
  private readonly random: SeededRandom;
  private readonly behavior: ComponentBehavior<number>;
  // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.6 (ADR-0009)
  private readonly events = new EventQueue<HarnessEvent>();
  private readonly tracked = new Map<number, Tracked>();
  private readonly violations: string[] = [];
  private readonly log: string[] = [];
  private readonly stats = emptyStats();
  private readonly maxEvents: number;
  private lastCounters: Readonly<Record<string, number>> = {};
  private nowMs = 0;
  private handled = 0;
  /** Set when the behavior can't go on; skips the end-of-run checks. */
  private aborted = false;

  constructor({ definition, config, settings }: ContractHarnessInput<Config>) {
    this.definition = definition;
    this.settings = settings;
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.6 (ADR-0009)
    this.random = new SeededRandom(settings.seed);
    this.behavior = definition.build<number>(config, {
      // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.6 (ADR-0009)
      random: new SeededRandom(settings.seed + 1),
    });
    this.maxEvents = settings.arrivals.requests * 1000;
  }

  run(): ScenarioResult {
    this.scheduleArrivals();
    this.handleEvents();
    if (!this.aborted) this.checkEnd();
    return { violations: this.violations, log: this.log, stats: this.stats };
  }

  private scheduleArrivals(): void {
    const { requests, meanGapMs, quietMs } = this.settings.arrivals;
    const { actions } = this.definition;
    let timeMs = 0;
    for (let request = 0; request < requests; request++) {
      if (request === Math.floor(requests / 2)) timeMs += quietMs;
      timeMs += sample({ kind: "exponential", meanMs: meanGapMs }, this.random);
      const action =
        actions[Math.floor(this.random.next() * actions.length)] ?? "invoke";
      this.events.schedule(timeMs, { kind: "arrive", request, action });
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

  /** What the harness does when each scheduled event comes due. */
  private readonly eventHandlers: KindHandlers<HarnessEvent, void> = {
    arrive: (event) => {
      this.arrive(event);
    },
    finish: (event) => {
      this.finish(event);
    },
    "dispatch-finished": (event) => {
      this.dispatchFinished(event);
    },
  };

  private arrive({ request, action }: ArriveEvent): void {
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

  private finish({ request }: FinishEvent): void {
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
  }: DispatchFinishedEvent): void {
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
    rejected:
      ({ request }) =>
      (state) => {
        this.stats.rejected++;
        this.leaveArriving({ request, state, to: "rejected" });
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
    const holdMs = this.random.next() * this.settings.maxHoldMs;
    this.events.schedule(this.nowMs + serviceMs + holdMs, {
      kind: "finish",
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
    const deliveryMs = this.random.next() * this.settings.maxHoldMs;
    const succeeded = this.random.next() >= this.settings.dispatchFailureRate;
    this.events.schedule(this.nowMs + deliveryMs, {
      kind: "dispatch-finished",
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

  /** Type-specific `gauges` and `counters`. */
  private checkExtraMetrics(): void {
    this.checkTypeGauges();
    this.checkCounters();
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

/** `ContractOptions` with every default filled in. */
function scenarioSettings<Config>(
  options: ContractOptions<Config>,
): ScenarioSettings {
  // Complexity 6, one `??` per default; there's nothing else to branch on.
  return {
    seed: options.seed ?? 1,
    arrivals: {
      requests: options.requests ?? 400,
      meanGapMs: options.meanGapMs ?? 1,
      quietMs: options.quietMs ?? 60 * 60 * 1000,
    },
    maxHoldMs: options.maxHoldMs ?? 20,
    dispatchFailureRate: options.dispatchFailureRate ?? 0.2,
  };
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

function emptyStats(): ContractStats {
  return { started: 0, queued: 0, rejected: 0, dispatched: 0 };
}
