import { describe, expect, it } from "vitest";
import { checkComponentContract } from "./check-component-contract";
import type {
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
  LimitGauge,
  RefuseWhenFull,
  WhenFull,
} from "./component-behavior";
import type { BuildContext, ComponentDefinition } from "./component-definition";
import {
  concurrencyGauge,
  rateGauge,
  type ConcurrencySource,
  type RateSource,
} from "./limit-gauges";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "./testing/fake-definitions";

type Behavior = ComponentBehavior<number>;

/**
 * Copies `base`, replacing parts of the behavior it builds, to make a
 * deliberately broken definition. Gauges are read through getters so the
 * replacements stay live.
 */
function broken<Config>(
  base: ComponentDefinition<Config>,
  patch: (behavior: Behavior) => Partial<Behavior>,
  overrides: Partial<ComponentDefinition<Config>> = {},
): ComponentDefinition<Config> {
  return {
    ...base,
    ...overrides,
    build<T>(config: Config, context: BuildContext) {
      const inner = base.build<number>(config, context);
      const p = patch(inner);
      const dispatchFinished =
        p.dispatchFinished ??
        (inner.dispatchFinished === undefined
          ? undefined
          : (input: DispatchFinishedInput<number>) =>
              inner.dispatchFinished?.(input) ?? []);
      const behavior: Behavior = {
        arrive: p.arrive ?? ((input) => inner.arrive(input)),
        finish: p.finish ?? ((input) => inner.finish(input)),
        ...(dispatchFinished === undefined ? {} : { dispatchFinished }),
        get inProgress() {
          return p.inProgress ?? inner.inProgress;
        },
        get queueDepth() {
          return p.queueDepth ?? inner.queueDepth;
        },
        get gauges() {
          return p.gauges ?? inner.gauges;
        },
        get counters() {
          return p.counters ?? inner.counters;
        },
        get limits() {
          return p.limits ?? inner.limits;
        },
      };
      // The checker always uses number tokens, so T is number here.
      return behavior as unknown as ComponentBehavior<T>;
    },
  };
}

/** The behavior's work in progress, against a limit of 1. */
const overOne = (b: Behavior): ConcurrencySource => ({
  limit: 1,
  get inUse() {
    return b.inProgress;
  },
});

/** A rate limit of 1 per second whose `taken` is `read()`. */
interface FakeRate {
  readonly burst: number;
  readonly read: () => number;
  /** Tokens left; a full bucket if omitted. */
  readonly left?: () => number;
}

const rateTaking = ({ burst, read, left }: FakeRate): RateSource => ({
  ratePerSec: 1,
  burst,
  available: () => left?.() ?? burst,
  get taken() {
    return read();
  },
});

const QUEUE_FULL: RefuseWhenFull = { kind: "refuse", reason: "queue-full" };
const WAIT_IN_LINE: WhenFull = { kind: "wait", holds: "waitLine" };

/** What the worker pool's two limits declare, and the wait line's size. */
interface PoolDeclarations {
  readonly workers: WhenFull;
  readonly waitLine: WhenFull;
  /** The default config's 8 if omitted. */
  readonly waitLineLimit?: number;
}

/**
 * The default worker pool's limits, read live from `b`, with their
 * declarations replaced.
 */
const poolLimits = (
  b: Behavior,
  { workers, waitLine, waitLineLimit = 8 }: PoolDeclarations,
): LimitGauge[] => [
  concurrencyGauge({
    name: "workers",
    whenFull: workers,
    source: {
      limit: 4,
      get inUse() {
        return b.inProgress;
      },
    },
  }),
  concurrencyGauge({
    name: "waitLine",
    whenFull: waitLine,
    source: {
      limit: waitLineLimit,
      get inUse() {
        return b.queueDepth;
      },
    },
  }),
];

const firstViolation = <C>(definition: ComponentDefinition<C>) =>
  checkComponentContract(definition).violations[0] ?? "(none)";

describe("checkComponentContract", () => {
  it("passes a correct worker pool, and the scenario reaches every outcome", () => {
    const report = checkComponentContract(workerPoolDefinition);
    expect(report.violations).toEqual([]);
    expect(report.stats.started).toBeGreaterThan(0);
    expect(report.stats.queued).toBeGreaterThan(0);
    expect(report.stats.rejected).toBeGreaterThan(0);
  });

  it("passes a correct queue, including redelivery after failures", () => {
    const report = checkComponentContract(messageQueueDefinition);
    expect(report.violations).toEqual([]);
    expect(report.stats.dispatched).toBeGreaterThan(report.stats.started);
  });

  describe("catches broken definitions", () => {
    it("an arrival with no outcome", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        arrive: (input) => b.arrive(input).filter((e) => e.kind !== "rejected"),
      }));
      expect(firstViolation(def)).toMatch(/gave no outcome/);
    });

    it("a request started twice", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        arrive: (input) => [...b.arrive(input), ...b.arrive(input)],
      }));
      expect(firstViolation(def)).toMatch(/started while started/);
    });

    it("a queued request that is never started", () => {
      // Releases the slot but drops the waiter it was handed.
      const def = broken(workerPoolDefinition, (b) => ({
        finish: (input) => {
          b.finish(input);
          return [];
        },
      }));
      expect(checkComponentContract(def).violations.join("\n")).toMatch(
        /inProgress is|queued but never started/,
      );
    });

    it("a gauge that disagrees with the effects", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        get inProgress() {
          return b.queueDepth;
        },
      }));
      expect(firstViolation(def)).toMatch(
        /inProgress is 0; the effects imply 1/,
      );
    });

    it("a counter that goes down", () => {
      const definition = broken(workerPoolDefinition, (b) => ({
        get counters() {
          return { busy: b.inProgress };
        },
      }));
      expect(firstViolation(definition)).toMatch(/counter busy went from/);
    });

    it("a gauge that isn't a number", () => {
      const definition = broken(workerPoolDefinition, () => ({
        gauges: { broken: Number.NaN },
      }));
      expect(firstViolation(definition)).toMatch(/gauge broken is NaN/);
    });

    // Fails if the contract stops comparing a concurrency limit's use to its limit.
    it("a concurrency limit used beyond its limit", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: [
          concurrencyGauge({
            name: "workers",
            whenFull: WAIT_IN_LINE,
            source: overOne(b),
          }),
          ...(b.limits ?? []).slice(1),
        ],
      }));
      expect(firstViolation(def)).toMatch(
        /limit workers has 2 in use out of 1/,
      );
    });

    // Fails if the contract stops checking that `taken` never decreases.
    it("a rate limit whose taken count goes down", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: [
          ...(b.limits ?? []),
          rateGauge({
            name: "rate",
            whenFull: QUEUE_FULL,
            source: rateTaking({ burst: 1_000, read: () => b.inProgress }),
          }),
        ],
      }));
      expect(firstViolation(def)).toMatch(
        /limit rate taken went from \d+ to \d+/,
      );
    });

    // Fails if the contract stops bounding `taken` by the burst and the rate.
    it("a rate limit that takes more than its burst and rate allow", () => {
      let reads = 0;
      const def = broken(workerPoolDefinition, (b) => ({
        limits: [
          ...(b.limits ?? []),
          rateGauge({
            name: "rate",
            whenFull: QUEUE_FULL,
            source: rateTaking({ burst: 1, read: () => ++reads }),
          }),
        ],
      }));
      expect(firstViolation(def)).toMatch(
        /limit rate took \d+ tokens by now; its burst and rate allow/,
      );
    });

    // Fails if the contract stops checking the bucket's level against its size.
    it("a rate limit with more tokens left than its bucket holds", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: [
          ...(b.limits ?? []),
          rateGauge({
            name: "rate",
            whenFull: QUEUE_FULL,
            source: rateTaking({
              burst: 1_000,
              read: () => 0,
              left: () => 1_001,
            }),
          }),
        ],
      }));
      expect(firstViolation(def)).toMatch(
        /limit rate has 1001 tokens left of 1000/,
      );
    });

    // Fails if the contract stops comparing each read's limits to the last.
    it("limits that change between reads", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        get limits() {
          return b.inProgress > 1 ? [] : b.limits;
        },
      }));
      expect(firstViolation(def)).toMatch(
        /limits changed from \[concurrency workers \(waits holding waitLine\), concurrency waitLine \(refuses queue-full\)\] to \[\]/,
      );
    });

    // Fails if the signature that each read is compared by leaves out
    // `whenFull`.
    it("a limit whose declaration changes between reads", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        get limits() {
          const workers = b.inProgress > 1 ? QUEUE_FULL : WAIT_IN_LINE;
          return poolLimits(b, { workers, waitLine: QUEUE_FULL });
        },
      }));
      expect(firstViolation(def)).toMatch(
        /from \[concurrency workers \(waits holding waitLine\), .*\] to \[concurrency workers \(refuses queue-full\), /,
      );
    });

    // Fails if the contract stops looking up the limit that waiting work
    // holds, or lets a limit hold itself.
    it.each(["queue", "workers"])("waiting that holds %s", (holds) => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: poolLimits(b, {
          workers: { kind: "wait", holds },
          waitLine: QUEUE_FULL,
        }),
      }));
      expect(firstViolation(def)).toContain(
        `limit workers holds ${holds}, which isn't another of its component's limits.`,
      );
    });

    // Fails if the contract accepts a held limit whatever it does when full.
    it("waiting that holds a limit that doesn't refuse", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: poolLimits(b, {
          workers: WAIT_IN_LINE,
          waitLine: { kind: "wait", holds: undefined },
        }),
      }));
      expect(firstViolation(def)).toMatch(
        /limit workers holds waitLine, which doesn't refuse work/,
      );
    });

    // Fails if the contract stops matching a rejection's reason to the
    // limits' declarations.
    it("a rejection whose reason no limit declares", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: poolLimits(b, {
          workers: WAIT_IN_LINE,
          waitLine: { kind: "refuse", reason: "line-full" },
        }),
      }));
      expect(firstViolation(def)).toMatch(
        /rejected as "queue-full", which none of its limits declares/,
      );
    });

    // Fails if the contract stops checking that the declaring concurrency
    // limit is full when it rejects.
    it("a rejection while the concurrency limit declaring it has room", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: poolLimits(b, {
          workers: WAIT_IN_LINE,
          waitLine: QUEUE_FULL,
          waitLineLimit: 9,
        }),
      }));
      expect(firstViolation(def)).toMatch(
        /rejected as "queue-full" while waitLine had room/,
      );
    });

    // Fails if the contract reads a bucket's level wrongly when checking a
    // rejection, e.g. as tokens taken instead of tokens left.
    it("a rejection while the bucket declaring it has tokens", () => {
      const def = broken(workerPoolDefinition, () => ({
        limits: [
          concurrencyGauge({
            name: "workers",
            whenFull: { kind: "wait", holds: undefined },
            source: { limit: 4, inUse: 0 },
          }),
          rateGauge({
            name: "rate",
            whenFull: QUEUE_FULL,
            source: rateTaking({ burst: 1_000, read: () => 0 }),
          }),
        ],
      }));
      expect(firstViolation(def)).toMatch(
        /rejected as "queue-full" while rate had room/,
      );
    });

    // Fails if the contract stops looking for limits with the same name.
    it("two limits with the same name", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        limits: [...(b.limits ?? []), ...(b.limits ?? [])],
      }));
      expect(firstViolation(def)).toMatch(
        /limit workers appears more than once/,
      );
    });

    it("a negative service time", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        arrive: (input) =>
          b
            .arrive(input)
            .map((e): Effect<number> =>
              e.kind === "started" ? { ...e, serviceMs: -1 } : e,
            ),
      }));
      expect(firstViolation(def)).toMatch(/invalid serviceMs -1/);
    });

    it("state shared between runs, so the same seed gives different results", () => {
      let builds = 0;
      const def = broken(workerPoolDefinition, (b) => {
        builds++;
        const extraMs = builds;
        return {
          arrive: (input) =>
            b
              .arrive(input)
              .map((e): Effect<number> =>
                e.kind === "started"
                  ? { ...e, serviceMs: e.serviceMs + extraMs }
                  : e,
              ),
        };
      });
      expect(firstViolation(def)).toMatch(/Not deterministic/);
    });

    it("dispatching without deliversAsync", () => {
      const def = broken(messageQueueDefinition, () => ({}), {
        deliversAsync: false,
      });
      expect(firstViolation(def)).toMatch(/doesn't set deliversAsync/);
    });

    it("async work that is dropped instead of redelivered", () => {
      const def = broken(messageQueueDefinition, (b) => ({
        dispatchFinished: (input) =>
          b.dispatchFinished?.({ ...input, succeeded: true }) ?? [],
      }));
      expect(firstViolation(def)).toMatch(
        /queueDepth is|async work never delivered/,
      );
    });

    it("an invalid defaultConfig", () => {
      const def = {
        ...workerPoolDefinition,
        defaultConfig: { ...workerPoolDefinition.defaultConfig, workers: 0 },
      };
      expect(firstViolation(def)).toMatch(/defaultConfig/);
    });
  });
});
