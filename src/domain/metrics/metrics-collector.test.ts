import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../components/aws";
import type { SimulationEvent } from "../engine/simulation";
import type { Edge, Project } from "../model/project";
import { simulateWithMetrics } from "./metrics-collector";

// api -> fn -> db with constant timings, 1 ms edges, light load: every
// request takes api 10 + (1 + fn 20 + (1 + db 15 + 1) + 1) = 49 ms.

const constant = (valueMs: number) => ({ kind: "constant", valueMs });

const edge = (from: string, to: string, timeoutMs = 1_000): Edge => ({
  id: `${from}->${to}`,
  from,
  to,
  latencyMs: 1,
  timeoutMs,
  retry: { maxAttempts: 2, backoff: "none", baseDelayMs: 0 },
});

function project({ queryMs = 15, dbTimeoutMs = 1_000 } = {}): Project {
  return {
    id: "p",
    name: "Test",
    architecture: {
      components: [
        {
          id: "api",
          type: "api-gateway",
          name: "API",
          config: { ratePerSec: 10_000, burst: 5_000, overhead: constant(10) },
        },
        {
          id: "fn",
          type: "lambda",
          name: "Function",
          config: {
            concurrency: 100,
            coldStart: constant(0),
            idleTimeoutSec: 600,
            computeTime: constant(20),
          },
        },
        {
          id: "db",
          type: "rds",
          name: "Database",
          config: {
            maxConnections: 90,
            queryWorkers: 16,
            queryTime: constant(queryMs),
          },
        },
      ],
      edges: [edge("api", "fn"), edge("fn", "db", dbTimeoutMs)],
    },
    workflows: [
      {
        id: "get",
        name: "Get",
        root: {
          componentId: "api",
          action: "invoke",
          calls: [
            {
              componentId: "fn",
              action: "invoke",
              calls: [{ componentId: "db", action: "read" }],
            },
          ],
        },
      },
    ],
    workloads: [
      {
        id: "light",
        name: "Light",
        durationSec: 3,
        seed: 1,
        mix: [{ workflowId: "get", weight: 1 }],
        profile: [{ atSec: 0, requestsPerSec: 5 }],
      },
    ],
  };
}

const run = (p: Project) =>
  simulateWithMetrics({
    project: p,
    workloadId: "light",
    registry: createAwsComponentRegistry(),
  });

describe("simulateWithMetrics", () => {
  it("snapshots every second, and the snapshots add up to the totals", () => {
    const events: SimulationEvent[] = [];
    const result = simulateWithMetrics({
      project: project(),
      workloadId: "light",
      registry: createAwsComponentRegistry(),
      observer: (e) => events.push(e),
    });
    expect(result.snapshots.map((s) => [s.startMs, s.endMs])).toEqual([
      [0, 1_000],
      [1_000, 2_000],
      [2_000, 3_000],
    ]);
    const sum = (pick: (s: (typeof result.snapshots)[number]) => number) =>
      result.snapshots.reduce((total, s) => total + pick(s), 0);
    const { totals } = result;
    expect(totals.workflows["get"]?.started).toBe(
      events.filter((e) => e.kind === "workflow-started").length,
    );
    expect(sum((s) => s.workflows["get"]?.started ?? 0)).toBe(
      totals.workflows["get"]?.started,
    );
    expect(sum((s) => s.components["db"]?.arrivals ?? 0)).toBe(
      totals.components["db"]?.arrivals,
    );
    expect(sum((s) => s.components["fn"]?.counters["coldStarts"] ?? 0)).toBe(
      totals.components["fn"]?.counters["coldStarts"],
    );
    expect(totals.components["fn"]?.counters["coldStarts"]).toBeGreaterThan(0);
  });

  it("reports latency per component and end to end", () => {
    const { totals } = run(project());
    const get = totals.workflows["get"];
    expect(get?.failed).toBe(0);
    expect(get?.latency?.p50).toBeCloseTo(49, 6);
    expect(get?.latency?.p99).toBeCloseTo(49, 6);
    // fn: 20 ms of its own, plus 1 + 15 + 1 waiting on db.
    expect(totals.components["fn"]?.latency?.p99).toBeCloseTo(37, 6);
    expect(totals.components["db"]?.latency?.p99).toBeCloseTo(15, 6);
    expect(totals.components["db"]?.gauges).toEqual({ connectionsHeld: 0 });
  });

  it("counts a timeout once, where it happened, and groups failures by cause", () => {
    const { totals } = run(project({ queryMs: 50, dbTimeoutMs: 10 }));
    const get = totals.workflows["get"];
    const requests = get?.started ?? 0;
    expect(requests).toBeGreaterThan(5);
    // Both edges allow 2 attempts: each request invokes fn twice, and each
    // invocation tries db twice. All of db's attempts time out; fn answers
    // well within its own timeout, so it has none. The workflow ends at about
    // 90 ms, so even the last request is answered before the run ends.
    expect(totals.components["db"]?.timeouts).toBe(4 * requests);
    expect(totals.components["fn"]?.timeouts).toBe(0);
    expect(totals.components["fn"]?.failed).toBe(2 * requests);
    expect(get?.failures).toEqual({ "db: timeout": requests });
    expect(get?.latency).toBeUndefined();
  });
});
