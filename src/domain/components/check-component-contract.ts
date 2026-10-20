import type { ComponentDefinition } from "./component-definition";
import {
  createContractHarness,
  emptyStats,
  MAX_VIOLATIONS,
  type ContractHarnessInput,
  type ContractScenario,
  type ContractStats,
} from "./contract-harness";

export type { ContractStats } from "./contract-harness";

export interface ContractInput<Config> {
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

export interface ContractReport {
  /** Broken rules, in the order they were found. Empty means the definition passed. */
  readonly violations: string[];
  readonly stats: ContractStats;
}

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
 * - `limits` keep their rules (see `checkLimits`): the same limits on
 *   every read, concurrency use within the limit, and rate limits taking
 *   no more than their burst and rate allow;
 * - the same seed produces exactly the same effects.
 *
 * Each definition's test asserts that `violations` is empty.
 */
export function checkComponentContract<Config>(
  definition: ComponentDefinition<Config>,
  input: ContractInput<Config> = {},
): ContractReport {
  const problems = checkDefinition(definition);
  if (problems.length > 0) return { violations: problems, stats: emptyStats() };

  const harnessInput: ContractHarnessInput<Config> = {
    definition,
    config: input.config ?? definition.defaultConfig,
    scenario: contractScenario(input),
  };
  const first = createContractHarness(harnessInput).run();
  const second = createContractHarness(harnessInput).run();
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

/** `ContractInput` with every default filled in. */
function contractScenario<Config>(
  input: ContractInput<Config>,
): ContractScenario {
  // Complexity 6, one `??` per default; there's nothing else to branch on.
  return {
    seed: input.seed ?? 1,
    arrivals: {
      requests: input.requests ?? 400,
      meanGapMs: input.meanGapMs ?? 1,
      quietMs: input.quietMs ?? 60 * 60 * 1000,
    },
    maxHoldMs: input.maxHoldMs ?? 20,
    dispatchFailureRate: input.dispatchFailureRate ?? 0.2,
  };
}
