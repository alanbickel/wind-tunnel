import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type {
  ComponentMetrics,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import {
  componentIn,
  limitIn,
} from "../../domain/metrics/testing/snapshot-lookups";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";
import { runTemplate } from "../templates/testing/run-template";

// The report derives "in progress", "unfinished", and "being delivered" by
// subtraction and tells readers the sums add up. These tests check each
// derived number against an independent one, so a counting bug shows up
// here instead of being absorbed into the remainder. Each component's
// limits get the same treatment: their use is checked against the limit
// and against a count of the same thing taken another way.

const registry = createAwsComponentRegistry();

/** Each concurrency limit's use, counted from other fields of the window. */
interface IndependentUse {
  readonly current: (m: ComponentMetrics) => number;
  /** Where the limit is the component's only work, its peak is too. */
  readonly peak?: (m: ComponentMetrics) => number;
}

// Lambda's slots and RDS's workers hold exactly the work in progress. An
// RDS connection is held by every running or waiting query.
const INDEPENDENT_USE: Readonly<Record<string, IndependentUse>> = {
  concurrency: { current: (m) => m.inProgress, peak: (m) => m.peakInProgress },
  queryWorkers: { current: (m) => m.inProgress, peak: (m) => m.peakInProgress },
  connections: { current: (m) => m.inProgress + m.queueDepth },
};

/** Every limit of every component in a snapshot, with the component's metrics. */
function limitsOf(snapshot: MetricsSnapshot) {
  return Object.entries(snapshot.components).flatMap(([id, metrics]) =>
    metrics.limits.map((limit) => ({ id, metrics, limit })),
  );
}

const windowSec = (s: MetricsSnapshot) => (s.endMs - s.startMs) / 1000;

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s's totals reconcile", (_, template) => {
  const { project, totals, snapshots } = runTemplate(template);

  it("leaves some work unfinished, so the checks below mean something", () => {
    const api = totals.components.api;
    expect(api?.inProgress).toBeGreaterThan(0);
  });

  it("matches each component's unfinished work to its state at the end", () => {
    for (const component of project.architecture.components) {
      const m = totals.components[component.id];
      if (m === undefined) throw new Error(component.id);
      const unfinished = m.arrivals - m.completed - m.failed - m.rejected;
      // A queue's backlog holds messages whose send already finished.
      const waiting = registry.get(component.type)?.deliversAsync
        ? 0
        : m.queueDepth;
      expect(unfinished, component.id).toBe(m.inProgress + waiting);
    }
  });

  it("matches workflows in progress to requests unfinished at the entry point", () => {
    // Every workflow starts at `api` with no retries, so each user request
    // is exactly one arrival there.
    const inProgress = Object.values(totals.workflows).reduce(
      (n, w) => n + w.started - w.succeeded - w.failed,
      0,
    );
    const api = totals.components.api;
    if (api === undefined) throw new Error("api");
    expect(api.arrivals).toBe(
      Object.values(totals.workflows).reduce((n, w) => n + w.started, 0),
    );
    expect(inProgress).toBe(api.inProgress);
  });

  it("adds up the per-second rows to the totals", () => {
    for (const [id, w] of Object.entries(totals.workflows)) {
      const rows = snapshots.map((s) => s.workflows[id]);
      expect(rows.reduce((n, r) => n + (r?.started ?? 0), 0)).toBe(w.started);
      expect(rows.reduce((n, r) => n + (r?.succeeded ?? 0), 0)).toBe(
        w.succeeded,
      );
      expect(rows.reduce((n, r) => n + (r?.failed ?? 0), 0)).toBe(w.failed);
    }
  });

  // Fails if a concurrency limit's peak stops covering its use: with the
  // engine no longer tracking it after each call, and the tick no longer
  // raising it to the use at the window's end, a peak reads under the end.
  // The rate bound holds by a wide margin here; the contract check tests it.
  it("never uses more of a limit than it allows", () => {
    for (const snapshot of snapshots) {
      for (const { id, limit } of limitsOf(snapshot)) {
        const where = `${id} ${limit.name} at ${String(snapshot.endMs)} ms`;
        const allowed =
          limit.kind === "rate"
            ? limit.limit + limit.burst / windowSec(snapshot)
            : limit.limit;
        expect(limit.peak, where).toBeLessThanOrEqual(allowed);
        expect(limit.current, where).toBeLessThanOrEqual(limit.peak);
      }
    }
  });

  // Fails if a component reports the wrong slots as in use, or the engine
  // stops tracking a limit's peak after every call.
  it("matches each concurrency limit's use to an independent count", () => {
    let checked = 0;
    for (const snapshot of snapshots) {
      for (const { id, metrics, limit } of limitsOf(snapshot)) {
        const count = INDEPENDENT_USE[limit.name];
        if (count === undefined) continue;
        const where = `${id} ${limit.name} at ${String(snapshot.endMs)} ms`;
        expect(limit.current, where).toBe(count.current(metrics));
        if (count.peak !== undefined) {
          expect(limit.peak, where).toBe(count.peak(metrics));
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(snapshots.length * 2);
  });

  // Fails if a rate limit counts throttled requests as tokens taken, or
  // stops counting admitted ones.
  it("takes one rate token for each request a rate-limited component admits", () => {
    for (const snapshot of snapshots) {
      for (const [id, m] of Object.entries(snapshot.components)) {
        const rates = m.limits.filter((l) => l.kind === "rate");
        if (rates.length === 0) continue;
        const taken =
          rates.reduce((n, l) => n + l.current, 0) * windowSec(snapshot);
        expect(taken, `${id} at ${String(snapshot.endMs)} ms`).toBeCloseTo(
          m.arrivals - m.rejected,
          6,
        );
      }
    }
  });

  // Fails if the totals stop keeping each limit's highest peak, or its
  // value at the end of the run.
  it("reports each limit's highest peak and latest use in the totals", () => {
    const last = snapshots.at(-1);
    if (last === undefined) throw new Error("no snapshots");
    for (const { id, limit } of limitsOf(totals)) {
      const peaks = snapshots.map(
        (s) => limitIn(componentIn(s, id), limit.name).peak,
      );
      const where = `${id} ${limit.name}`;
      expect(limit.peak, where).toBe(Math.max(...peaks));
      expect(limit.current, where).toBe(
        limitIn(componentIn(last, id), limit.name).current,
      );
    }
  });
});

describe("template-b's queue", () => {
  // Run while collecting, as above: a whole-template run inside `it` counts
  // against the 5 s test timeout, which a busy parallel run can exceed (#15).
  const { totals } = runTemplate(templateB);

  it("is delivering exactly the messages its consumer is working on", () => {
    const queue = totals.components["orders-queue"];
    const consumer = totals.components["fn-writer"];
    if (queue === undefined || consumer === undefined) throw new Error();
    const delivering =
      queue.completed - queue.asyncSucceeded - queue.queueDepth;
    // fn-writer is called only by the queue's deliveries.
    expect(delivering).toBe(consumer.inProgress + consumer.queueDepth);
    expect(delivering).toBeGreaterThan(0);
  });

  // Fails if SQS stops counting a delivery against its consumer limit while
  // the delivery is in flight.
  it("holds a consumer slot for each message being delivered", () => {
    const queue = componentIn(totals, "orders-queue");
    const delivering =
      queue.completed - queue.asyncSucceeded - queue.queueDepth;
    expect(limitIn(queue, "consumerConcurrency").current).toBe(delivering);
    expect(delivering).toBeGreaterThan(0);
  });
});
