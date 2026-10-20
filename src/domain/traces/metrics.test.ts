import { describe, expect, it } from "vitest";
import type { Edge, Project } from "../model/project";
import { createAwsComponentRegistry } from "../components/aws";
import { simulateWithMetrics } from "../metrics/metrics-collector";
import {
  componentIn,
  limitIn,
  workflowIn,
} from "../metrics/testing/snapshot-lookups";
import { table } from "./format";

// Worked examples for docs/architecture/metrics.md;
// format.ts explains the snapshots. Accept an intended change with
// `npx vitest run -u src/domain/traces/metrics`,
// then check the guide still matches.

describe("traces", () => {
  it("Metrics: per-second snapshots of a short spike", async () => {
    const constant = (valueMs: number) => ({ kind: "constant", valueMs });
    const edge = (from: string, to: string): Edge => ({
      id: `${from}->${to}`,
      from,
      to,
      latencyMs: 1,
      timeoutMs: 1_000,
      retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
    });
    const project: Project = {
      id: "p",
      name: "Spike",
      architecture: {
        components: [
          {
            id: "fn",
            type: "lambda",
            name: "Function",
            config: {
              concurrency: 50,
              coldStart: constant(200),
              idleTimeoutSec: 600,
              computeTime: constant(10),
            },
          },
          {
            id: "db",
            type: "rds",
            name: "Database",
            config: {
              maxConnections: 8,
              queryWorkers: 2,
              queryTime: constant(20),
            },
          },
        ],
        edges: [edge("fn", "db")],
      },
      workflows: [
        {
          id: "get",
          name: "Get order",
          root: {
            componentId: "fn",
            action: "invoke",
            calls: [{ componentId: "db", action: "read" }],
          },
        },
      ],
      workloads: [
        {
          id: "spike",
          name: "Spike",
          durationMs: 8_000,
          seed: 7,
          mix: [{ workflowId: "get", weight: 1 }],
          profile: [
            { atMs: 0, requestsPerSec: 40 },
            { atMs: 3_000, requestsPerSec: 40 },
            { atMs: 3_000, requestsPerSec: 200 },
            { atMs: 5_000, requestsPerSec: 200 },
            { atMs: 5_000, requestsPerSec: 40 },
          ],
        },
      ],
    };
    const { snapshots, totals } = simulateWithMetrics({
      project,
      workloadId: "spike",
      registry: createAwsComponentRegistry(),
    });

    const ms = (value: number | undefined) =>
      value === undefined ? "-" : value.toFixed(0);
    const row = (label: string, s: (typeof snapshots)[number]) => {
      const get = workflowIn(s, "get");
      const db = componentIn(s, "db");
      const fn = componentIn(s, "fn");
      const connections = limitIn(db, "connections");
      return [
        label,
        String(get.started),
        String(get.succeeded),
        String(get.failed),
        ms(get.latency?.p50Ms),
        ms(get.latency?.p99Ms),
        String(db.peakQueueDepth),
        `${String(connections.peak)} of ${String(connections.limit)}`,
        String(db.rejected),
        String(fn.counters["coldStarts"]),
      ];
    };
    const rows = snapshots.map((s) =>
      row(`${String(s.startMs / 1000)}-${String(s.endMs / 1000)}`, s),
    );
    rows.push(row("total", totals));
    await expect(
      [
        table(
          [
            'Workflow "Get order": fn -> db, 1 ms edges, no retries. fn: 10 ms of work,',
            "200 ms cold starts. db: 8 connections, 2 query workers, 20 ms queries, so",
            "it handles at most 100 queries/s. Load: 40 requests/s, then 200/s from",
            "3 s to 5 s. One row per snapshot (simulated second), then the run's totals.",
            "requests: started; ok/failed: answered. p50/p99: latency of ok requests.",
            "db queue and connections: the most at once in the row's time.",
          ].join("\n"),
          [
            "second",
            "requests",
            "ok",
            "failed",
            "p50",
            "p99",
            "db queue",
            "connections",
            "db rejected",
            "cold starts",
          ],
          rows,
        ),
        `Failures by cause: ${JSON.stringify(totals.workflows["get"]?.failures)}`,
        "",
      ].join("\n"),
    ).toMatchFileSnapshot("metrics.txt");
  });
});
