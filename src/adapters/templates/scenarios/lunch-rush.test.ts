import { beforeAll, describe, expect, it } from "vitest";
import type {
  LimitUse,
  MetricsRun,
  MetricsSnapshot,
} from "../../../domain/metrics/metrics-collector";
import {
  componentIn,
  limitIn,
} from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import type { Phase } from "../testing/scenario-runs";
import {
  SEEDS,
  backlog,
  during,
  exhaustedLimits,
  expectEveryRequestServed,
  failed,
  projectA,
  projectB,
  runScenario,
} from "../testing/scenario-runs";

// Under the lunch rush, Template A runs out of database connections during
// the spike and recovers after it; Template B absorbs the same traffic without
// failing. The lunch rush is steady at 200 requests/s until 10 s, ramps to
// 2,000 by 20 s, holds until 40 s, and is back to 200 by 50 s.

const CALM: Phase = { fromSec: 0, toSec: 10 };
const PEAK: Phase = { fromSec: 20, toSec: 40 };
const AFTER: Phase = { fromSec: 50, toSec: 60 };

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

const maxConnections = configNumber(projectA, "orders-db", "maxConnections");

describe.each(SEEDS)("the lunch rush, with seed %i", (seed) => {
  let a: MetricsRun, b: MetricsRun;
  beforeAll(() => {
    a = runScenario({ project: projectA, workloadId: "lunch-rush", seed });
    b = runScenario({ project: projectB, workloadId: "lunch-rush", seed });
  }, RUN_TIMEOUT_MS);

  // Fails if the two templates' lunch rushes differ, such as Template B's
  // peak cut to 1,900 requests/s.
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

    // Fails if orders-db's queryWorkers rises to 64: queries stop backing up,
    // so neither its connections nor fn-orders' concurrency runs out. Raising
    // maxConnections alone isn't enough: at 5,000, queued queries hold all
    // 1,000 of fn-orders' executions and it throttles instead.
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

    // Fails if orders-db's queryWorkers drops to 3: requests are still failing
    // in the 10 s after the spike.
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

    // Fails if orders-queue's consumerMaxConcurrency rises to 20: no backlog
    // builds, and the writes' p99 lands in about 250 ms.
    it("answers writes quickly while the writes themselves land late", () => {
      const answered = b.totals.workflows["create-order"]?.latency?.p99Ms;
      const landed = b.totals.components["orders-queue"]?.asyncLatency?.p99Ms;
      expect(answered).toBeLessThan(500);
      expect(landed).toBeGreaterThan(2000);
    });
  });
});
