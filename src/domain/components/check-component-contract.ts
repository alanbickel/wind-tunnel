import { EventQueue } from "../engine/event-queue";
import type { StepAction } from "../model/project";
import { sample } from "../random/distribution";
import { SeededRandom, type RandomSource } from "../random/random-source";
import type { Effect } from "./component-behavior";
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
  const violations: string[] = [];
  const config = options.config ?? definition.defaultConfig;

  if (!definition.configSchema.safeParse(definition.defaultConfig).success) {
    violations.push("defaultConfig doesn't pass configSchema.");
  }
  if (definition.actions.length === 0) {
    violations.push("The definition accepts no actions.");
  }
  if (violations.length > 0) return { violations, stats: emptyStats() };

  const first = runScenario(definition, config, options);
  const second = runScenario(definition, config, options);
  violations.push(...first.violations);
  if (first.violations.length === 0) {
    const index = first.log.findIndex((line, i) => line !== second.log[i]);
    if (index !== -1 || first.log.length !== second.log.length) {
      const at =
        index === -1 ? Math.min(first.log.length, second.log.length) : index;
      violations.push(
        `Not deterministic: two runs with the same seed differ at effect ${String(at)} ` +
          `("${first.log[at] ?? "(none)"}" vs "${second.log[at] ?? "(none)"}").`,
      );
    }
  }
  return {
    violations: violations.slice(0, MAX_VIOLATIONS),
    stats: first.stats,
  };
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

interface ScenarioResult {
  violations: string[];
  log: string[];
  stats: ContractStats;
}

function runScenario<Config>(
  definition: ComponentDefinition<Config>,
  config: Config,
  options: ContractOptions<Config>,
): ScenarioResult {
  const seed = options.seed ?? 1;
  const requests = options.requests ?? 400;
  const meanGapMs = options.meanGapMs ?? 1;
  const quietMs = options.quietMs ?? 60 * 60 * 1000;
  const maxHoldMs = options.maxHoldMs ?? 20;
  const failureRate = options.dispatchFailureRate ?? 0.2;

  // Separate sources, so the harness's draws don't change the component's.
  const harnessRandom = new SeededRandom(seed);
  const behavior = definition.build<number>(config, {
    random: new SeededRandom(seed + 1),
  });

  const violations: string[] = [];
  const log: string[] = [];
  const stats = emptyStats();
  const tracked = new Map<number, Tracked>();
  const events = new EventQueue<HarnessEvent>();
  let nowMs = 0;

  const violate = (request: number | undefined, message: string) => {
    const who = request === undefined ? "" : ` request ${String(request)}`;
    violations.push(`t=${nowMs.toFixed(3)}ms${who}: ${message}`);
  };

  scheduleArrivals(events, harnessRandom, definition.actions, {
    requests,
    meanGapMs,
    quietMs,
  });

  const apply = (effects: Effect<number>[]) => {
    for (const effect of effects) {
      const { request } = effect;
      const state = tracked.get(request);
      log.push(describeEffect(nowMs, effect));
      if (state === undefined) {
        violate(request, `"${effect.kind}" for a request that never arrived.`);
        continue;
      }
      switch (effect.kind) {
        case "started":
          stats.started++;
          if (state.phase !== "arriving" && state.phase !== "queued") {
            violate(request, `started while ${state.phase}.`);
            break;
          }
          if (!Number.isFinite(effect.serviceMs) || effect.serviceMs < 0) {
            violate(request, `invalid serviceMs ${String(effect.serviceMs)}.`);
            break;
          }
          state.phase = "started";
          events.schedule(
            nowMs + effect.serviceMs + harnessRandom.next() * maxHoldMs,
            { kind: "finish", request },
          );
          break;
        case "queued":
          stats.queued++;
          if (state.phase !== "arriving") {
            violate(request, `queued while ${state.phase}.`);
            break;
          }
          state.phase = "queued";
          break;
        case "rejected":
          stats.rejected++;
          if (state.phase !== "arriving") {
            violate(request, `rejected while ${state.phase}.`);
            break;
          }
          state.phase = "rejected";
          break;
        case "dispatched":
          stats.dispatched++;
          if (!definition.deliversAsync) {
            violate(
              request,
              "dispatched, but the definition doesn't set deliversAsync.",
            );
            break;
          }
          if (state.phase !== "finished" || state.delivery !== "waiting") {
            violate(
              request,
              `dispatched while ${state.phase}${state.delivery === undefined ? "" : `, ${state.delivery}`}.`,
            );
            break;
          }
          state.delivery = "in-flight";
          events.schedule(nowMs + harnessRandom.next() * maxHoldMs, {
            kind: "dispatch-finished",
            request,
            succeeded: harnessRandom.next() >= failureRate,
          });
          break;
      }
    }
  };

  let lastCounters: Readonly<Record<string, number>> = {};
  const checkExtraMetrics = () => {
    for (const [name, value] of Object.entries(behavior.gauges ?? {})) {
      if (!Number.isFinite(value)) {
        violate(undefined, `gauge ${name} is ${String(value)}.`);
      }
    }
    const counters = behavior.counters ?? {};
    for (const [name, value] of Object.entries(counters)) {
      const last = lastCounters[name] ?? 0;
      if (!Number.isFinite(value) || value < last) {
        violate(
          undefined,
          `counter ${name} went from ${String(last)} to ${String(value)}.`,
        );
      }
    }
    lastCounters = { ...counters };
  };

  const checkGauges = () => {
    let inProgress = 0;
    let queueDepth = 0;
    for (const state of tracked.values()) {
      if (state.phase === "started") inProgress++;
      if (state.phase === "queued" || state.delivery === "waiting")
        queueDepth++;
    }
    if (behavior.inProgress !== inProgress) {
      violate(
        undefined,
        `inProgress is ${String(behavior.inProgress)}; the effects imply ${String(inProgress)}.`,
      );
    }
    if (behavior.queueDepth !== queueDepth) {
      violate(
        undefined,
        `queueDepth is ${String(behavior.queueDepth)}; the effects imply ${String(queueDepth)}.`,
      );
    }
  };

  const maxEvents = requests * 1000;
  let handled = 0;
  for (let next = events.pop(); next !== undefined; next = events.pop()) {
    if (++handled > maxEvents || violations.length >= MAX_VIOLATIONS) break;
    nowMs = next.timeMs;
    const event = next.payload;
    const { request } = event;
    switch (event.kind) {
      case "arrive": {
        tracked.set(request, { phase: "arriving" });
        apply(behavior.arrive({ request, action: event.action, nowMs }));
        const state = tracked.get(request);
        if (state?.phase === "arriving") {
          violate(
            request,
            "arrive() gave no outcome (started, queued, or rejected).",
          );
          state.phase = "rejected";
        }
        break;
      }
      case "finish": {
        const state = tracked.get(request);
        if (state !== undefined) {
          state.phase = "finished";
          if (definition.deliversAsync) state.delivery = "waiting";
        }
        apply(behavior.finish({ request, nowMs }));
        break;
      }
      case "dispatch-finished": {
        const state = tracked.get(request);
        if (state !== undefined) {
          state.delivery = event.succeeded ? "delivered" : "waiting";
        }
        if (behavior.dispatchFinished === undefined) {
          violate(
            request,
            "deliversAsync is set, but there's no dispatchFinished().",
          );
          return { violations, log, stats };
        }
        apply(
          behavior.dispatchFinished({
            request,
            succeeded: event.succeeded,
            nowMs,
          }),
        );
        break;
      }
    }
    checkGauges();
    checkExtraMetrics();
  }

  if (handled > maxEvents) {
    violate(
      undefined,
      `still busy after ${String(maxEvents)} events; work never drains.`,
    );
  }
  for (const [request, state] of tracked) {
    if (violations.length >= MAX_VIOLATIONS) break;
    if (state.phase === "queued") violate(request, "queued but never started.");
    if (state.delivery === "waiting" || state.delivery === "in-flight") {
      violate(request, "async work never delivered.");
    }
  }
  return { violations, log, stats };
}

function scheduleArrivals(
  events: EventQueue<HarnessEvent>,
  random: RandomSource,
  actions: readonly StepAction[],
  plan: ArrivalPlan,
): void {
  let timeMs = 0;
  for (let request = 0; request < plan.requests; request++) {
    if (request === Math.floor(plan.requests / 2)) timeMs += plan.quietMs;
    timeMs += sample({ kind: "exponential", meanMs: plan.meanGapMs }, random);
    const action =
      actions[Math.floor(random.next() * actions.length)] ?? "invoke";
    events.schedule(timeMs, { kind: "arrive", request, action });
  }
}

function describeEffect(nowMs: number, effect: Effect<number>): string {
  const detail =
    effect.kind === "started"
      ? ` ${String(effect.serviceMs)}`
      : effect.kind === "rejected"
        ? ` ${effect.reason}`
        : "";
  return `${String(nowMs)} ${effect.kind} ${String(effect.request)}${detail}`;
}

function emptyStats(): ContractStats {
  return { started: 0, queued: 0, rejected: 0, dispatched: 0 };
}
