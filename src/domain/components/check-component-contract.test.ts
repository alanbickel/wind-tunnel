import { describe, expect, it } from "vitest";
import { checkComponentContract } from "./check-component-contract";
import type {
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
} from "./component-behavior";
import type { BuildContext, ComponentDefinition } from "./component-definition";
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
      };
      // The checker always uses number tokens, so T is number here.
      return behavior as unknown as ComponentBehavior<T>;
    },
  };
}

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
