import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../components/aws";
import type {
  Component,
  Edge,
  Project,
  Step,
  Workload,
} from "../model/project";
import { simulate } from "./create-simulation";
import type {
  ComponentSample,
  ConcurrencyLimitSample,
  SimulationEvent,
} from "./simulation-events";

// Small projects with constant timings, so latencies can be worked out by
// hand. Edges take 1 ms each way unless a test says otherwise.

const constant = (valueMs: number) => ({ kind: "constant", valueMs });

const components: Record<string, Component> = {
  api: {
    id: "api",
    type: "api-gateway",
    name: "API",
    config: { ratePerSec: 10_000, burst: 5_000, overhead: constant(10) },
  },
  fn: {
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
  db: {
    id: "db",
    type: "rds",
    name: "Database",
    config: { maxConnections: 90, queryWorkers: 16, queryTime: constant(15) },
  },
  queue: {
    id: "queue",
    type: "sqs",
    name: "Queue",
    config: { consumerMaxConcurrency: 2, sendLatency: constant(5) },
  },
  writer: {
    id: "writer",
    type: "lambda",
    name: "Writer",
    config: {
      concurrency: 10,
      coldStart: constant(0),
      idleTimeoutSec: 600,
      computeTime: constant(20),
    },
  },
};

const edge = (
  from: string,
  to: string,
  overrides: Partial<Edge> = {},
): Edge => ({
  id: `${from}->${to}`,
  from,
  to,
  latencyMs: 1,
  timeoutMs: 1_000,
  retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
  ...overrides,
});

/** A few requests per second: no contention, so every request takes as long. */
const lightLoad: Workload = {
  id: "light",
  name: "Light",
  durationMs: 5_000,
  seed: 1,
  mix: [{ workflowId: "main", weight: 1 }],
  profile: [{ atMs: 0, requestsPerSec: 2 }],
};

interface Setup {
  root: Step;
  edges: Edge[];
  overrides?: Record<string, Partial<Component["config"]>>;
  untilMs?: number;
  tickMs?: number;
}

function run({
  root,
  edges,
  overrides = {},
  untilMs,
  tickMs,
}: Setup): SimulationEvent[] {
  const project: Project = {
    id: "p",
    name: "Test",
    architecture: {
      components: Object.values(components).map((c) => ({
        ...c,
        config: { ...c.config, ...overrides[c.id] },
      })),
      edges,
    },
    workflows: [{ id: "main", name: "Main", root }],
    workloads: [lightLoad],
  };
  const events: SimulationEvent[] = [];
  simulate({
    project,
    workloadId: "light",
    registry: createAwsComponentRegistry(),
    observer: (e) => events.push(e),
    ...(untilMs === undefined ? {} : { untilMs }),
    ...(tickMs === undefined ? {} : { tickMs }),
  });
  return events;
}

const ofKind = <K extends SimulationEvent["kind"]>(
  events: SimulationEvent[],
  kind: K,
) =>
  events.filter(
    (e): e is Extract<SimulationEvent, { kind: K }> => e.kind === kind,
  );

/** An RDS sample's two limits, in the order RDS reports them. */
interface RdsLimitSamples {
  readonly connections: ConcurrencyLimitSample;
  readonly workers: ConcurrencyLimitSample;
}

function rdsLimits(db: ComponentSample | undefined): RdsLimitSamples {
  const [connections, workers] = db?.limits ?? [];
  if (connections?.kind !== "concurrency") throw new Error("connections");
  if (workers?.kind !== "concurrency") throw new Error("queryWorkers");
  expect([connections.name, workers.name]).toEqual([
    "connections",
    "queryWorkers",
  ]);
  return { connections, workers };
}

/**
 * Each waiting or running query holds a connection; each running one holds
 * a worker, and only running queries are in progress.
 */
function expectRdsLimitsMatchItsWork(db: ComponentSample): void {
  const { connections, workers } = rdsLimits(db);
  expect(connections.inUse).toBe(db.inProgress + db.queueDepth);
  expect(workers.peakInUse).toBe(db.peakInProgress);
  expect(connections.peakInUse).toBeGreaterThanOrEqual(
    Math.max(db.peakInProgress, db.peakQueueDepth, connections.inUse),
  );
  expect(connections.peakInUse).toBeLessThanOrEqual(
    db.peakInProgress + db.peakQueueDepth,
  );
}

const apiFnDb: Step = {
  componentId: "api",
  action: "invoke",
  calls: [
    {
      componentId: "fn",
      action: "invoke",
      calls: [{ componentId: "db", action: "read" }],
    },
  ],
};

describe("simulate", () => {
  it("adds up service times, nested calls, and edge latency both ways", () => {
    const events = run({
      root: apiFnDb,
      edges: [edge("api", "fn"), edge("fn", "db")],
    });
    const finished = ofKind(events, "workflow-finished");
    expect(finished.length).toBeGreaterThan(3);
    // api 10 + (1 + fn 20 + (1 + db 15 + 1) + 1) = 49 ms
    for (const f of finished) {
      expect(f.latencyMs).toBe(49);
      expect(f.failure).toBeUndefined();
    }
  });

  it("makes nested calls in order, each after the previous one returns", () => {
    const root: Step = {
      componentId: "fn",
      action: "invoke",
      calls: [
        { componentId: "db", action: "read" },
        { componentId: "db", action: "write" },
      ],
    };
    const events = run({ root, edges: [edge("fn", "db")] });
    const first = ofKind(events, "component-arrived").filter(
      (e) => e.requestId === 0 && e.componentId === "db",
    );
    expect(first.map((e) => e.action)).toEqual(["read", "write"]);
    const start = ofKind(events, "workflow-started")[0]?.timeMs ?? 0;
    // fn 20; read arrives at 21, runs 15 ms, is answered at 37; write arrives at 38.
    expect(first.map((e) => e.timeMs - start)).toEqual([21, 38]);
  });

  it("retries a rejected call by the edge's policy, then fails the workflow", () => {
    const events = run({
      root: apiFnDb,
      edges: [
        edge("api", "fn", {
          retry: { maxAttempts: 3, backoff: "none", baseDelayMs: 10 },
        }),
        edge("fn", "db"),
      ],
      overrides: { fn: { concurrency: 0 } },
    });
    const failures = ofKind(events, "edge-attempt-failed").filter(
      (e) => e.requestId === 0,
    );
    const start = ofKind(events, "workflow-started")[0]?.timeMs ?? 0;
    expect(
      failures.map((e) => [
        e.attempt,
        e.timeMs - start,
        e.retryAtMs !== undefined,
      ]),
    ).toEqual([
      [1, 12, true],
      [2, 24, true],
      [3, 36, false],
    ]);
    expect(ofKind(events, "workflow-finished")[0]).toMatchObject({
      latencyMs: 36,
      failure: { componentId: "fn", reason: "throttled" },
    });
  });

  it("stops waiting at the timeout, but the callee's work carries on", () => {
    const events = run({
      root: apiFnDb,
      edges: [edge("api", "fn"), edge("fn", "db", { timeoutMs: 100 })],
      overrides: { db: { queryTime: constant(500) } },
      untilMs: 10_000,
    });
    const start = ofKind(events, "workflow-started")[0]?.timeMs ?? 0;
    // fn calls db at 31; gives up at 131; the answer reaches the user at 132.
    expect(ofKind(events, "workflow-finished")[0]).toMatchObject({
      latencyMs: 132,
      failure: { componentId: "db", reason: "timeout" },
    });
    // The query still runs to the end: it arrived at 32 and takes 500 ms.
    const query = ofKind(events, "component-finished").find(
      (e) => e.requestId === 0 && e.componentId === "db",
    );
    expect(query && query.timeMs - start).toBe(532);
  });

  // Fails if the engine attaches a failure to a delivery that succeeded,
  // even an undefined one (e.g. it spreads `{ failure }` unconditionally).
  it("answers the user once the message is sent, and runs async work later", () => {
    const root: Step = {
      componentId: "api",
      action: "invoke",
      calls: [
        {
          componentId: "fn",
          action: "invoke",
          calls: [
            {
              componentId: "queue",
              action: "enqueue",
              async: {
                componentId: "writer",
                action: "invoke",
                calls: [{ componentId: "db", action: "write" }],
              },
            },
          ],
        },
      ],
    };
    const events = run({
      root,
      edges: [
        edge("api", "fn"),
        edge("fn", "queue"),
        edge("queue", "writer"),
        edge("writer", "db"),
      ],
    });
    // api 10 + (1 + fn 20 + (1 + send 5 + 1) + 1) = 39 ms
    expect(ofKind(events, "workflow-finished")[0]?.latencyMs).toBe(39);
    // Sent at 37; writer 1 + 20 + (1 + 15 + 1) + 1 = 39 more: 76 ms from the start.
    expect(ofKind(events, "component-async-finished")[0]).toMatchObject({
      requestId: 0,
      componentId: "queue",
      latencyMs: 76,
    });
    expect(ofKind(events, "component-async-finished")[0]).not.toHaveProperty(
      "failure",
    );
  });

  it("is deterministic", () => {
    const setup = {
      root: apiFnDb,
      edges: [edge("api", "fn"), edge("fn", "db")],
    };
    expect(run(setup)).toEqual(run(setup));
  });

  it("keeps arrival times when a component's config changes", () => {
    const edges = [edge("api", "fn"), edge("fn", "db")];
    const times = (events: SimulationEvent[]) =>
      ofKind(events, "workflow-started").map((e) => e.timeMs);
    const slowDb = { db: { queryTime: { kind: "exponential", meanMs: 30 } } };
    expect(times(run({ root: apiFnDb, edges, overrides: slowDb }))).toEqual(
      times(run({ root: apiFnDb, edges })),
    );
  });

  // Processes MAX_EVENTS_AT_ONE_INSTANT events before it throws: about 1 s
  // alone, but it has timed out at the default 5 s in a busy parallel run.
  it("stops a run that loops without advancing time", () => {
    const root: Step = {
      componentId: "queue",
      action: "enqueue",
      async: { componentId: "writer", action: "invoke" },
    };
    expect(() =>
      run({
        root,
        edges: [edge("queue", "writer", { latencyMs: 0 })],
        overrides: { writer: { concurrency: 0 } },
      }),
    ).toThrow(/stuck/);
  }, 30_000);

  describe("metrics ticks", () => {
    it("ticks every tickMs and at the end, before other events at that time", () => {
      const events = run({
        root: apiFnDb,
        edges: [edge("api", "fn"), edge("fn", "db")],
        untilMs: 2_500,
        tickMs: 1_000,
      });
      const ticks = ofKind(events, "metrics-tick");
      expect(ticks.map((t) => t.timeMs)).toEqual([1_000, 2_000, 2_500]);
      for (const tick of ticks) {
        const at = events.indexOf(tick);
        const before = events
          .slice(0, at)
          .filter((e) => e.kind !== "metrics-tick");
        const isLast = tick.timeMs === 2_500;
        for (const e of before)
          expect(e.timeMs).toBeLessThanOrEqual(tick.timeMs);
        // Only the end-of-run tick may share its time with earlier events.
        const strictlyBefore = isLast ? [] : before;
        for (const e of strictlyBefore)
          expect(e.timeMs).toBeLessThan(tick.timeMs);
        const after = events.slice(at + 1);
        for (const e of after)
          expect(e.timeMs).toBeGreaterThanOrEqual(tick.timeMs);
        expect(tick.components.map((c) => c.componentId)).toEqual(
          Object.keys(components),
        );
      }
    });

    // Fails if a tick stops sampling a component's limits, or a limit's
    // peak stops being tracked after every call (it would miss the queue
    // that forms and drains between ticks).
    it("samples peaks since the last tick, limits, and type-specific values", () => {
      const events = run({
        root: apiFnDb,
        edges: [edge("api", "fn"), edge("fn", "db")],
        overrides: { db: { queryWorkers: 1, queryTime: constant(400) } },
        tickMs: 1_000,
      });
      const samples = ofKind(events, "metrics-tick").map((t) => {
        const of = (id: string) =>
          t.components.find((c) => c.componentId === id);
        return { db: of("db"), fn: of("fn") };
      });
      expect(samples).toHaveLength(5);
      let coldStarts = 0;
      for (const { db, fn } of samples) {
        if (db === undefined || fn === undefined) throw new Error("missing");
        expect(db.peakInProgress).toBeGreaterThanOrEqual(db.inProgress);
        expect(db.peakQueueDepth).toBeGreaterThanOrEqual(db.queueDepth);
        expectRdsLimitsMatchItsWork(db);
        const total = fn.counters["coldStarts"] ?? 0;
        expect(total).toBeGreaterThanOrEqual(coldStarts);
        coldStarts = total;
      }
      // 2 requests/s against 400 ms queries on one worker: a line forms.
      expect(
        Math.max(...samples.map((s) => s.db?.peakQueueDepth ?? 0)),
      ).toBeGreaterThan(0);
      // The line forms and drains between ticks, so only a tracked peak sees it.
      const connections = samples.map((s) => rdsLimits(s.db).connections);
      expect(Math.max(...connections.map((c) => c.peakInUse))).toBeGreaterThan(
        Math.max(...connections.map((c) => c.inUse)),
      );
      expect(coldStarts).toBeGreaterThan(0);
    });

    it("refuses a tickMs that isn't positive", () => {
      expect(() =>
        run({
          root: apiFnDb,
          edges: [edge("api", "fn"), edge("fn", "db")],
          tickMs: 0,
        }),
      ).toThrow(/tickMs/);
    });
  });

  it("refuses an unknown workload", () => {
    expect(() =>
      simulate({
        project: {
          id: "p",
          name: "Empty",
          architecture: { components: [], edges: [] },
          workflows: [],
          workloads: [],
        },
        workloadId: "nope",
        registry: createAwsComponentRegistry(),
      }),
    ).toThrow(/No workload "nope"/);
  });
});
