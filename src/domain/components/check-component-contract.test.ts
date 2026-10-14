import { describe, expect, it } from "vitest";
import { checkComponentContract } from "./check-component-contract";
import type { ComponentBehavior, Effect } from "./component-behavior";
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
          : (r: number, ok: boolean, t: number) =>
              inner.dispatchFinished?.(r, ok, t) ?? []);
      const behavior: Behavior = {
        arrive: p.arrive ?? ((r, a, t) => inner.arrive(r, a, t)),
        finish: p.finish ?? ((r, t) => inner.finish(r, t)),
        ...(dispatchFinished === undefined ? {} : { dispatchFinished }),
        get inProgress() {
          return p.inProgress ?? inner.inProgress;
        },
        get queueDepth() {
          return p.queueDepth ?? inner.queueDepth;
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
        arrive: (r, a, t) =>
          b.arrive(r, a, t).filter((e) => e.kind !== "rejected"),
      }));
      expect(firstViolation(def)).toMatch(/gave no outcome/);
    });

    it("a request started twice", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        arrive: (r, a, t) => [...b.arrive(r, a, t), ...b.arrive(r, a, t)],
      }));
      expect(firstViolation(def)).toMatch(/started while started/);
    });

    it("a queued request that is never started", () => {
      // Releases the slot but drops the waiter it was handed.
      const def = broken(workerPoolDefinition, (b) => ({
        finish: (r, t) => {
          b.finish(r, t);
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

    it("a negative service time", () => {
      const def = broken(workerPoolDefinition, (b) => ({
        arrive: (r, a, t) =>
          b
            .arrive(r, a, t)
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
          arrive: (r, a, t) =>
            b
              .arrive(r, a, t)
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
        dispatchFinished: (r, _succeeded, t) =>
          b.dispatchFinished?.(r, true, t) ?? [],
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
