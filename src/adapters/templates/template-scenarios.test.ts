import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import {
  componentIn,
  limitIn,
} from "../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../domain/model/project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";
import { loadTemplate } from "./testing/run-template";

// Scenario tests: each template must teach its lesson under the lunch rush.
// Template A runs out of database connections during the spike and recovers
// after it; Template B absorbs the same traffic without failing. Each runs on
// several seeds so a lesson can't rest on one lucky run. The phases follow
// the lunch rush profile: steady 200 requests/s until 10 s, ramping to 2,000
// by 20 s, steady until 40 s, back to 200 by 50 s.

const registry = createAwsComponentRegistry();
const SEEDS = [42, 7, 2026];

const CALM = { fromSec: 0, toSec: 10 };
const PEAK = { fromSec: 20, toSec: 40 };
const AFTER = { fromSec: 50, toSec: 60 };

function run(project: Project, seed: number) {
  const workloads = project.workloads.map((w) => ({ ...w, seed }));
  return simulateWithMetrics({
    project: { ...project, workloads },
    workloadId: "lunch-rush",
    registry,
  });
}

function during(
  snapshots: readonly MetricsSnapshot[],
  phase: { fromSec: number; toSec: number },
): MetricsSnapshot[] {
  return snapshots.filter(
    (s) => s.startMs >= phase.fromSec * 1000 && s.endMs <= phase.toSec * 1000,
  );
}

function failed(snapshot: MetricsSnapshot): number {
  return Object.values(snapshot.workflows).reduce((n, w) => n + w.failed, 0);
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

const projectA = loadTemplate(templateA);
const projectB = loadTemplate(templateB);
const maxConnections = configNumber(projectA, "orders-db", "maxConnections");

describe.each(SEEDS)("with seed %i", (seed) => {
  const a = run(projectA, seed);
  const b = run(projectB, seed);

  it("sends the same requests to both templates", () => {
    for (const id of ["get-order", "create-order"]) {
      expect(b.totals.workflows[id]?.started).toBe(
        a.totals.workflows[id]?.started,
      );
    }
  });

  describe("Template A (RDS)", () => {
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
    it("serves every request without a failure", () => {
      for (const [id, w] of Object.entries(b.totals.workflows)) {
        expect({ id, failed: w.failed }).toEqual({ id, failed: 0 });
      }
      for (const [id, c] of Object.entries(b.totals.components)) {
        expect({ id, rejected: c.rejected }).toEqual({ id, rejected: 0 });
      }
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

    // Fails if a Template B component reaches a limit other than the queue's
    // consumer cap, which is what holds back the backlog.
    it("stays under every limit but the queue's consumer cap, which it reaches", () => {
      const reached = Object.entries(b.totals.components).flatMap(([id, c]) =>
        c.limits
          .filter((limit) => limit.peak >= limit.limit)
          .map((limit) => `${id} ${limit.name}`),
      );
      expect(reached).toEqual(["orders-queue consumerConcurrency"]);
    });

    it("builds a backlog during the spike and empties it before the run ends", () => {
      const backlog = (s: MetricsSnapshot) =>
        s.components["orders-queue"]?.queueDepth ?? NaN;
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
