import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import { limitExhausted } from "../../domain/metrics/limit-exhausted";
import {
  componentIn,
  limitIn,
  workflowIn,
} from "../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../domain/model/project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";
import { loadTemplate } from "./testing/run-template";

// Scenario tests: each template must teach its lesson under each workload.
// Under the lunch rush, Template A runs out of database connections during
// the spike and recovers after it; Template B absorbs the same traffic without
// failing. Under the steady day, both have every limit to spare. Under the
// long rush, Template A fails for the whole peak, and Template B still fails
// nothing but falls further behind on writes the longer the peak lasts. Each
// runs on several seeds so a lesson can't rest on one lucky run.
//
// The phases follow the profiles. The lunch rush is steady at 200 requests/s
// until 10 s, ramps to 2,000 by 20 s, holds until 40 s, and is back to 200 by
// 50 s. The long rush ramps the same way but holds until 140 s, is back to 200
// by 150 s, and runs to 200 s so the queue can drain. The steady day is 200
// requests/s throughout.

const registry = createAwsComponentRegistry();
const SEEDS = [42, 7, 2026];

/** A stretch of a run, in whole seconds from its start. */
interface Phase {
  readonly fromSec: number;
  readonly toSec: number;
}

const CALM: Phase = { fromSec: 0, toSec: 10 };
const PEAK: Phase = { fromSec: 20, toSec: 40 };
const AFTER: Phase = { fromSec: 50, toSec: 60 };

const LONG_PEAK: Phase = { fromSec: 20, toSec: 140 };
const LONG_AFTER: Phase = { fromSec: 150, toSec: 200 };

function run(project: Project, workloadId: string, seed: number) {
  const workloads = project.workloads.map((w) => ({ ...w, seed }));
  return simulateWithMetrics({
    project: { ...project, workloads },
    workloadId,
    registry,
  });
}

function during(
  snapshots: readonly MetricsSnapshot[],
  phase: Phase,
): MetricsSnapshot[] {
  return snapshots.filter(
    (s) => s.startMs >= phase.fromSec * 1000 && s.endMs <= phase.toSec * 1000,
  );
}

function failed(snapshot: MetricsSnapshot): number {
  return Object.values(snapshot.workflows).reduce((n, w) => n + w.failed, 0);
}

/** The snapshot of the second that ends `atSec` into the run. */
function secondEndingAt(
  snapshots: readonly MetricsSnapshot[],
  atSec: number,
): MetricsSnapshot {
  const snapshot = snapshots.find((s) => s.endMs === atSec * 1000);
  if (snapshot === undefined)
    throw new Error(`no second ending at ${String(atSec)}`);
  return snapshot;
}

/** Every limit a component ran out of, as "component limit". */
function exhaustedLimits(snapshot: MetricsSnapshot): string[] {
  return Object.entries(snapshot.components).flatMap(([id, c]) =>
    c.limits.filter(limitExhausted).map((l) => `${id} ${l.name}`),
  );
}

/** Messages waiting in orders-queue at the end of the second. */
function backlog(snapshot: MetricsSnapshot): number {
  return componentIn(snapshot, "orders-queue").queueDepth;
}

function expectEveryRequestServed(totals: MetricsSnapshot): void {
  for (const [id, w] of Object.entries(totals.workflows)) {
    expect({ id, failed: w.failed }).toEqual({ id, failed: 0 });
  }
  for (const [id, c] of Object.entries(totals.components)) {
    expect({ id, rejected: c.rejected }).toEqual({ id, rejected: 0 });
  }
}

function connections(snapshot: MetricsSnapshot): LimitUse {
  return limitIn(componentIn(snapshot, "orders-db"), "connections");
}

/** orders-db's connections held at the end of the second. */
function connectionsHeld(snapshot: MetricsSnapshot): number {
  return connections(snapshot).current;
}

/** The most orders-db connections held at once during the second. */
function peakConnections(snapshot: MetricsSnapshot): number {
  return connections(snapshot).peak;
}

function configNumber(project: Project, componentId: string, key: string) {
  const component = project.architecture.components.find(
    (c) => c.id === componentId,
  );
  const value = component?.config[key];
  if (typeof value !== "number") throw new Error(`${componentId}.${key}`);
  return value;
}

function edgeTimeoutMs(project: Project, edgeId: string): number {
  const edge = project.architecture.edges.find((e) => e.id === edgeId);
  if (edge === undefined) throw new Error(edgeId);
  return edge.timeoutMs;
}

const projectA = loadTemplate(templateA);
const projectB = loadTemplate(templateB);
const maxConnections = configNumber(projectA, "orders-db", "maxConnections");

describe.each(SEEDS)("the lunch rush, with seed %i", (seed) => {
  const a = run(projectA, "lunch-rush", seed);
  const b = run(projectB, "lunch-rush", seed);

  it("sends the same requests to both templates", () => {
    for (const id of ["get-order", "create-order"]) {
      expect(b.totals.workflows[id]?.started).toBe(
        a.totals.workflows[id]?.started,
      );
    }
  });

  describe("Template A (RDS)", () => {
    // Fails if calm traffic fails a request, or ever holds half of
    // orders-db's connections at once: with queryWorkers cut from 16 to 4,
    // queries pile up and seeds 42 and 2026 peak at 62 and 57 of 45, still
    // without a failure.
    it("serves calm traffic without failures", () => {
      const calm = during(a.snapshots, CALM);
      expect(calm.map(failed)).toEqual(calm.map(() => 0));
      expect(Math.max(...calm.map(peakConnections))).toBeLessThan(
        maxConnections / 2,
      );
    });

    // Fails if orders-db stops reporting its connections limit, or the
    // limit stops being reached at the peak (the template's lesson).
    it("holds nearly every connection through the peak and reaches the limit", () => {
      const peak = during(a.snapshots, PEAK);
      expect(Math.min(...peak.map(connectionsHeld))).toBeGreaterThanOrEqual(
        0.9 * maxConnections,
      );
      expect(Math.max(...peak.map(connectionsHeld))).toBe(maxConnections);
      expect(connections(a.totals)).toMatchObject({
        limit: maxConnections,
        peak: maxConnections,
      });
    });

    it("fails requests in every second of the peak", () => {
      for (const snapshot of during(a.snapshots, PEAK)) {
        expect(failed(snapshot)).toBeGreaterThan(0);
      }
    });

    it("fails a large share of requests, all from connection exhaustion", () => {
      const workflows = Object.values(a.totals.workflows);
      const started = workflows.reduce((n, w) => n + w.started, 0);
      const failures = workflows.reduce((n, w) => n + w.failed, 0);
      expect(failures / started).toBeGreaterThan(0.25);
      for (const w of workflows) {
        expect(Object.keys(w.failures)).toEqual([
          "orders-db: too-many-connections",
        ]);
      }
      expect(a.totals.components["orders-db"]?.rejected).toBe(failures);
    });

    it("recovers after the spike", () => {
      const after = during(a.snapshots, AFTER);
      expect(after.map(failed)).toEqual(after.map(() => 0));
    });
  });

  describe("Template B (DynamoDB + SQS)", () => {
    // Fails if orders-read's readUnitsPerSec drops to 1,000: the spike's reads
    // empty the token bucket, and throttled reads fail once their retries run
    // out.
    it("serves every request without a failure", () => {
      expectEveryRequestServed(b.totals);
    });

    // Fails if the queue delivers past its consumer cap, letting more writes
    // reach the database at once.
    it("keeps database connections under the queue consumer cap", () => {
      const cap = configNumber(
        projectB,
        "orders-queue",
        "consumerMaxConcurrency",
      );
      expect(cap).toBeLessThan(maxConnections);
      expect(connections(b.totals).peak).toBeLessThanOrEqual(cap);
    });

    // Fails if a Template B component exhausts a limit other than the
    // queue's consumer cap, which is what holds back the backlog.
    it("exhausts no limit but the queue's consumer cap", () => {
      expect(exhaustedLimits(b.totals)).toEqual([
        "orders-queue consumerConcurrency",
      ]);
    });

    // Fails if orders-queue's consumerMaxConcurrency rises to 20: the
    // consumers keep up with the spike's writes, so no backlog builds.
    it("builds a backlog during the spike and empties it before the run ends", () => {
      const calm = during(b.snapshots, CALM).map(backlog);
      const peak = during(b.snapshots, PEAK).map(backlog);
      expect(Math.max(...calm)).toBeLessThan(10);
      expect(peak.at(-1)).toBeGreaterThan(500);
      expect(peak.at(-1)).toBeGreaterThan(peak[peak.length / 2] ?? NaN);
      expect(b.snapshots.at(-1)?.components["orders-queue"]?.queueDepth).toBe(
        0,
      );
    });

    it("answers writes quickly while the writes themselves land late", () => {
      const answered = b.totals.workflows["create-order"]?.latency?.p99Ms;
      const landed = b.totals.components["orders-queue"]?.asyncLatency?.p99Ms;
      expect(answered).toBeLessThan(500);
      expect(landed).toBeGreaterThan(2000);
    });
  });
});

describe.each(SEEDS)("the steady day, with seed %i", (seed) => {
  const a = run(projectA, "steady-day", seed);
  const b = run(projectB, "steady-day", seed);

  // Fails if the steady day runs at 250 requests/s: nothing fails, but
  // orders-db's 16 query workers all fill at once on seeds 7 and 2026.
  it("serves Template A's traffic with every limit to spare", () => {
    expectEveryRequestServed(a.totals);
    expect(exhaustedLimits(a.totals)).toEqual([]);
  });

  // In the first second, fn-writer's cold starts hold the queue's consumer
  // slots long enough to fill all 15 on seeds 42 and 7, so the check starts
  // at the second second. Fails if orders-queue's consumerMaxConcurrency
  // drops to 2 (its minimum): both consumers are busy at once every second.
  it("serves Template B's traffic with every limit to spare once fn-writer is warm", () => {
    expectEveryRequestServed(b.totals);
    const warm = during(b.snapshots, { fromSec: 1, toSec: 60 });
    expect(warm.flatMap(exhaustedLimits)).toEqual([]);
  });
});

describe.each(SEEDS)("the long rush, with seed %i", (seed) => {
  const a = run(projectA, "long-rush", seed);
  const b = run(projectB, "long-rush", seed);

  describe("Template A (RDS)", () => {
    // Fails if orders-db's queryWorkers rises to 64: queries keep up with the
    // peak, so connections are released in time and nothing fails.
    it("fails requests in every second of the peak, all from connection exhaustion", () => {
      for (const snapshot of during(a.snapshots, LONG_PEAK)) {
        expect(failed(snapshot)).toBeGreaterThan(0);
      }
      for (const w of Object.values(a.totals.workflows)) {
        expect(Object.keys(w.failures)).toEqual([
          "orders-db: too-many-connections",
        ]);
      }
    });

    // Fails if the rush doesn't end (the profile stays at 2,000 requests/s
    // after 140 s).
    it("recovers once the rush ends", () => {
      const after = during(a.snapshots, LONG_AFTER);
      expect(after.map(failed)).toEqual(after.map(() => 0));
    });
  });

  describe("Template B (DynamoDB + SQS)", () => {
    // Fails if orders-read's readUnitsPerSec drops to 1,500: the peak's reads
    // empty the token bucket, and throttled reads fail once their retries run
    // out.
    it("serves every request without a failure", () => {
      expectEveryRequestServed(b.totals);
    });

    // Writes arrive at about 400 a second at the peak, and 15 consumers
    // deliver about 315, so the backlog grows for as long as the peak lasts. Fails if orders-queue's consumerMaxConcurrency rises to 20: the
    // consumers keep up.
    it("grows the backlog through the whole peak", () => {
      const sampledAtSec = [40, 60, 80, 100, 120, 140];
      const depths = sampledAtSec.map((sec) =>
        backlog(secondEndingAt(b.snapshots, sec)),
      );
      const growth = depths.slice(1).map((n, i) => n - (depths[i] ?? NaN));
      expect(Math.min(...growth)).toBeGreaterThan(0);
    });

    // Fails if the run ends at 180 s, before the backlog has drained.
    it("empties the backlog before the run ends", () => {
      expect(b.snapshots.map(backlog).at(-1)).toBe(0);
    });

    // A write that lands later than API Gateway's integration timeout is one
    // a synchronous API couldn't have waited for. Fails if the peak is cut to
    // 90 s: the slowest writes then land in about 25 s.
    it("answers writes quickly while the writes land later than API Gateway would wait", () => {
      const answered = workflowIn(b.totals, "create-order").latency?.p99Ms;
      const landed = componentIn(b.totals, "orders-queue").asyncLatency?.p99Ms;
      expect(answered).toBeLessThan(500);
      expect(landed).toBeGreaterThan(edgeTimeoutMs(projectB, "api->fn-api"));
    });
  });
});
