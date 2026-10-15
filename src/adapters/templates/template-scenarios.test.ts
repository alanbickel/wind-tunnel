import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";
import { loadProject } from "../persistence/load-project";
import templateA from "./template-a.json";
import templateB from "./template-b.json";

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

function load(template: unknown): Project {
  const loaded = loadProject(template, registry);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  return loaded.project;
}

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

function connectionsHeld(snapshot: MetricsSnapshot): number {
  const held = snapshot.components["orders-db"]?.gauges.connectionsHeld;
  if (held === undefined) throw new Error("orders-db has no connectionsHeld");
  return held;
}

function configNumber(project: Project, componentId: string, key: string) {
  const component = project.architecture.components.find(
    (c) => c.id === componentId,
  );
  const value = component?.config[key];
  if (typeof value !== "number") throw new Error(`${componentId}.${key}`);
  return value;
}

const projectA = load(templateA);
const projectB = load(templateB);
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
      expect(Math.max(...calm.map(connectionsHeld))).toBeLessThan(
        maxConnections / 2,
      );
    });

    it("holds nearly every connection through the peak and reaches the limit", () => {
      const held = during(a.snapshots, PEAK).map(connectionsHeld);
      expect(Math.min(...held)).toBeGreaterThanOrEqual(0.9 * maxConnections);
      expect(Math.max(...held)).toBe(maxConnections);
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

    it("keeps database connections under the queue consumer cap", () => {
      const cap = configNumber(
        projectB,
        "orders-queue",
        "consumerMaxConcurrency",
      );
      expect(cap).toBeLessThan(maxConnections);
      const held = b.snapshots.map(connectionsHeld);
      expect(Math.max(...held)).toBeLessThanOrEqual(cap);
    });
  });
});
