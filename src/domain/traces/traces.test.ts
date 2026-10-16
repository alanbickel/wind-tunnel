import { describe, expect, it } from "vitest";
import { CountingSemaphore } from "../behaviors/counting-semaphore";
import { TokenBucket } from "../behaviors/token-bucket";
import { HeapEventQueue } from "../engine/heap-event-queue";
import type { Edge, Project } from "../model/project";
import { validateProject } from "../model/validate-project";
import {
  createAwsComponentRegistry,
  lambdaDefinition,
  rdsDefinition,
} from "../components/aws";
import { simulate } from "../engine/create-simulation";
import type {
  Failure,
  SimulationEvent,
  TickEvent,
} from "../engine/simulation-events";
import { simulateWithMetrics } from "../metrics/metrics-collector";
import { componentIn, workflowIn } from "../metrics/testing/snapshot-lookups";
import type {
  ComponentBehavior,
  Effect,
} from "../components/component-behavior";
import {
  messageQueueDefinition,
  workerPoolDefinition,
} from "../components/testing/fake-definitions";
import { SeededRandom } from "../random/random-source";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";

// Worked examples for the guides in docs/architecture/. Each test runs
// a building block through a small scenario and saves a text timeline next to
// this file. The timelines are snapshots: if behavior changes, the test fails
// and the diff shows exactly what changed. Run `npx vitest run -u` to accept
// an intended change, then check the doc still matches.

/** Renders rows as a left-aligned text table with a header. */
function table(title: string, header: string[], rows: string[][]): string {
  const widths = header.map((h, col) =>
    Math.max(h.length, ...rows.map((row) => (row[col] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, col) => cell.padEnd(widths[col] ?? 0))
      .join("  ")
      .trimEnd();
  return [title, "", line(header), ...rows.map(line), ""].join("\n");
}

const EFFECT_TEXT: KindHandlers<Effect<string>, string> = {
  started: (e) => `started ${e.request} (${String(e.serviceMs)} ms)`,
  rejected: (e) => `rejected ${e.request}: ${e.reason}`,
  queued: (e) => `queued ${e.request}`,
  dispatched: (e) => `dispatched ${e.request}`,
};

/** Effects as text, e.g. "started a (10 ms), queued b". */
function showEffects(effects: Effect<string>[]): string {
  return effects.map((e) => handleKind(EFFECT_TEXT, e)).join(", ") || "(none)";
}

/** Every event but ticks: the ones that belong to a request. */
type RequestEvent = Exclude<SimulationEvent, TickEvent>;

/** One line of a request's journey, after its time. */
type JourneyLine = [where: string, what: string];

/** How each event reads in a journey; `startMs` is the request's arrival. */
function journeyText(startMs: number): KindHandlers<RequestEvent, JourneyLine> {
  const cause = (failure: Failure) =>
    `${failure.componentId}: ${failure.reason}`;
  return {
    "workflow-started": (e) => ["user", `starts "${e.workflowId}"`],
    "workflow-finished": (e) => [
      "user",
      e.failure === undefined
        ? `gets an answer after ${String(e.latencyMs)} ms`
        : `gets an error after ${String(e.latencyMs)} ms (${cause(e.failure)})`,
    ],
    arrived: (e) => [e.componentId, `arrived (${e.action})`],
    queued: (e) => [e.componentId, "queued"],
    started: (e) => [
      e.componentId,
      `started, ${String(e.serviceMs)} ms of work`,
    ],
    rejected: (e) => [e.componentId, `rejected: ${e.reason}`],
    finished: (e) => [
      e.componentId,
      e.failure === undefined
        ? "finished, answer sent"
        : `finished with error (${cause(e.failure)})`,
    ],
    "attempt-failed": (e) => [
      e.edgeId,
      `attempt ${String(e.attempt)} failed (${cause(e.failure)})` +
        (e.retryAtMs === undefined
          ? ", no retries left"
          : `, retry at ${(e.retryAtMs - startMs).toFixed(0)}`),
    ],
    dispatched: (e) => [e.componentId, "dispatched"],
    "async-finished": (e) => [
      e.componentId,
      `async work done (${String(e.succeeded)})`,
    ],
  };
}

describe("traces", () => {
  it("EventQueue: earliest first, ties in scheduling order", async () => {
    const queue = new HeapEventQueue<string>();
    const scheduled: [number, string][] = [
      [20, "ServiceCompleted (req 1)"],
      [5, "RequestArrived (req 2)"],
      [20, "TimeoutFired (req 3)"],
      [0, "RequestArrived (req 1)"],
      [20, "RequestArrived (req 4)"],
    ];
    for (const [time, name] of scheduled) queue.schedule(time, name);

    const rows: string[][] = [];
    for (let e = queue.pop(); e !== undefined; e = queue.pop()) {
      rows.push([String(e.timeMs), String(e.sequence), e.payload]);
    }
    await expect(
      table(
        "Scheduled in this order: " +
          scheduled.map(([t]) => `t=${String(t)}`).join(", ") +
          "\nPopped in this order:",
        ["t(ms)", "seq", "event"],
        rows,
      ),
    ).toMatchFileSnapshot("event-queue.txt");
  });

  it("RateLimit: burst, then the steady rate", async () => {
    const limit = new TokenBucket({ ratePerSec: 10, burst: 5 });
    const rows: string[][] = [];
    const step = (timeMs: number, requests: number) => {
      const before = limit.available(timeMs);
      const results = Array.from({ length: requests }, () =>
        limit.tryTake(timeMs) ? "✓" : "✗",
      ).join("");
      rows.push([String(timeMs), before.toFixed(1), results]);
    };

    step(0, 8); // a spike after a quiet period
    for (let t = 50; t <= 300; t += 50) step(t, 1);
    step(1000, 3); // quiet for 700 ms: the bucket refills, capped at burst

    await expect(
      table(
        "RateLimit { ratePerSec: 10, burst: 5 }  (one token every 100 ms)",
        ["t(ms)", "tokens", "requests (✓ allowed, ✗ throttled)"],
        rows,
      ),
    ).toMatchFileSnapshot("rate-limit.txt");
  });

  it("ConcurrencyLimit: queueing hands freed slots to waiters", async () => {
    const limit = new CountingSemaphore<string>({
      limit: 2,
      whenFull: "queue",
      queueCapacity: 2,
    });
    const inProgress: string[] = [];
    const rows: string[][] = [];
    const record = (timeMs: number, action: string, note = "") => {
      rows.push([
        String(timeMs),
        action,
        String(limit.inUse),
        String(limit.queued),
        `[${inProgress.join(", ")}]`,
        note,
      ]);
    };
    const acquire = (timeMs: number, id: string) => {
      const result = limit.acquire(id);
      if (result === "admitted") inProgress.push(id);
      record(timeMs, `acquire ${id}`, result);
    };
    const release = (timeMs: number, id: string) => {
      inProgress.splice(inProgress.indexOf(id), 1);
      const next = limit.release();
      if (next !== undefined) inProgress.push(next);
      record(
        timeMs,
        `release ${id}`,
        next === undefined ? "slot freed" : `slot passed to ${next}`,
      );
    };

    acquire(0, "a");
    acquire(0, "b");
    acquire(0, "c");
    acquire(0, "d");
    acquire(0, "e");
    release(15, "a");
    release(20, "b");
    release(35, "c");
    release(40, "d");

    await expect(
      table(
        'ConcurrencyLimit { limit: 2, whenFull: "queue", queueCapacity: 2 }',
        ["t(ms)", "action", "inUse", "queued", "in progress", "result"],
        rows,
      ),
    ).toMatchFileSnapshot("concurrency-limit.txt");
  });

  it("validateProject: every problem, with a path to it", async () => {
    const edge = (from: string, to: string): Edge => ({
      id: `${from}->${to}`,
      from,
      to,
      latencyMs: 1,
      timeoutMs: 1000,
      retry: { maxAttempts: 1, backoff: "none", baseDelayMs: 0 },
    });
    const project: Project = {
      id: "p",
      name: "A project with mistakes",
      architecture: {
        components: [
          { id: "api", type: "api-gateway", name: "API", config: {} },
          { id: "fn", type: "lambda", name: "Function", config: {} },
          { id: "db", type: "rds", name: "Database", config: {} },
        ],
        edges: [edge("api", "fn"), edge("fn", "db"), edge("fn", "cache")],
      },
      workflows: [
        {
          id: "get",
          name: "Get",
          root: {
            componentId: "api",
            action: "invoke",
            calls: [{ componentId: "db", action: "read" }],
          },
        },
      ],
      workloads: [
        {
          id: "load",
          name: "Load",
          durationMs: 60_000,
          seed: 1,
          mix: [{ workflowId: "gett", weight: 1 }],
          profile: [
            { atMs: 0, requestsPerSec: 100 },
            { atMs: 0, requestsPerSec: 200 },
          ],
        },
      ],
    };
    const rows = validateProject(project).map((issue) => [
      issue.path.join("."),
      issue.message,
    ]);
    await expect(
      table(
        [
          "Architecture: api -> fn -> db, plus an edge to a missing 'cache'.",
          "Workflow 'get' calls db straight from api. The workload has a typo",
          "in its mix and two profile points at 0 s.",
        ].join("\n"),
        ["path", "message"],
        rows,
      ),
    ).toMatchFileSnapshot("validate-project.txt");
  });

  it("Component behavior: effects a definition returns to the engine", async () => {
    const random = new SeededRandom(1);

    const pool = workerPoolDefinition.build<string>(
      {
        workers: 2,
        queueCapacity: 1,
        serviceTime: { kind: "constant", valueMs: 10 },
      },
      { random },
    );
    const poolRows: string[][] = [];
    const onPool = (timeMs: number, call: string, effects: Effect<string>[]) =>
      poolRows.push([
        String(timeMs),
        call,
        showEffects(effects),
        String(pool.inProgress),
        String(pool.queueDepth),
      ]);
    for (const id of ["a", "b", "c", "d"]) {
      onPool(
        0,
        `arrive ${id}`,
        pool.arrive({ request: id, action: "invoke", nowMs: 0 }),
      );
    }
    onPool(10, "finish a", pool.finish({ request: "a", nowMs: 10 }));
    onPool(10, "finish b", pool.finish({ request: "b", nowMs: 10 }));
    onPool(20, "finish c", pool.finish({ request: "c", nowMs: 20 }));

    const queue = messageQueueDefinition.build<string>(
      { consumers: 1, sendMs: 1 },
      { random },
    );
    const queueRows: string[][] = [];
    const onQueue = (timeMs: number, call: string, effects: Effect<string>[]) =>
      queueRows.push([
        String(timeMs),
        call,
        showEffects(effects),
        String(queue.inProgress),
        String(queue.queueDepth),
      ]);
    onQueue(
      0,
      "arrive m1 (enqueue)",
      queue.arrive({ request: "m1", action: "enqueue", nowMs: 0 }),
    );
    onQueue(
      0,
      "arrive m2 (enqueue)",
      queue.arrive({ request: "m2", action: "enqueue", nowMs: 0 }),
    );
    onQueue(1, "finish m1", queue.finish({ request: "m1", nowMs: 1 }));
    onQueue(1, "finish m2", queue.finish({ request: "m2", nowMs: 1 }));
    onQueue(
      30,
      "dispatchFinished m1 ✗",
      queue.dispatchFinished?.({
        request: "m1",
        succeeded: false,
        nowMs: 30,
      }) ?? [],
    );
    onQueue(
      55,
      "dispatchFinished m2 ✓",
      queue.dispatchFinished?.({ request: "m2", succeeded: true, nowMs: 55 }) ??
        [],
    );
    onQueue(
      80,
      "dispatchFinished m1 ✓",
      queue.dispatchFinished?.({ request: "m1", succeeded: true, nowMs: 80 }) ??
        [],
    );

    const header = [
      "t(ms)",
      "engine calls",
      "effects returned",
      "inProgress",
      "queueDepth",
    ];
    await expect(
      [
        table(
          "Worker pool { workers: 2, queueCapacity: 1, service time 10 ms }",
          header,
          poolRows,
        ),
        table(
          "Message queue { consumers: 1, sendMs: 1 }  (deliversAsync)",
          header,
          queueRows,
        ),
      ].join("\n"),
    ).toMatchFileSnapshot("component-behavior.txt");
  });

  it("AWS components: Lambda cold starts and RDS connection exhaustion", async () => {
    const random = new SeededRandom(1);
    const header = [
      "t(ms)",
      "engine calls",
      "effects returned",
      "inProgress",
      "queueDepth",
      "why",
    ];
    const recorder = (behavior: ComponentBehavior<string>) => {
      const rows: string[][] = [];
      const record = (
        timeMs: number,
        call: string,
        effects: Effect<string>[],
        why = "",
      ) =>
        rows.push([
          String(timeMs),
          call,
          showEffects(effects),
          String(behavior.inProgress),
          String(behavior.queueDepth),
          why,
        ]);
      return { rows, record };
    };

    const fn = lambdaDefinition.build<string>(
      {
        concurrency: 2,
        coldStart: { kind: "constant", valueMs: 300 },
        idleTimeoutSec: 60,
        computeTime: { kind: "constant", valueMs: 20 },
      },
      { random },
    );
    const lambda = recorder(fn);
    lambda.record(
      0,
      "arrive a",
      fn.arrive({ request: "a", action: "invoke", nowMs: 0 }),
      "cold start",
    );
    lambda.record(
      0,
      "arrive b",
      fn.arrive({ request: "b", action: "invoke", nowMs: 0 }),
      "cold start",
    );
    lambda.record(
      0,
      "arrive c",
      fn.arrive({ request: "c", action: "invoke", nowMs: 0 }),
      "2 of 2 busy",
    );
    lambda.record(
      320,
      "finish a",
      fn.finish({ request: "a", nowMs: 320 }),
      "a's env is warm",
    );
    lambda.record(
      320,
      "finish b",
      fn.finish({ request: "b", nowMs: 320 }),
      "b's env is warm",
    );
    lambda.record(
      400,
      "arrive d",
      fn.arrive({ request: "d", action: "invoke", nowMs: 400 }),
      "warm",
    );
    lambda.record(420, "finish d", fn.finish({ request: "d", nowMs: 420 }));
    lambda.record(
      90_000,
      "arrive e",
      fn.arrive({ request: "e", action: "invoke", nowMs: 90_000 }),
      "idle > 60 s: cold",
    );

    const db = rdsDefinition.build<string>(
      {
        maxConnections: 3,
        queryWorkers: 1,
        queryTime: { kind: "constant", valueMs: 15 },
      },
      { random },
    );
    const rds = recorder(db);
    rds.record(
      0,
      "arrive a",
      db.arrive({ request: "a", action: "read", nowMs: 0 }),
      "connection 1",
    );
    rds.record(
      0,
      "arrive b",
      db.arrive({ request: "b", action: "read", nowMs: 0 }),
      "connection 2",
    );
    rds.record(
      0,
      "arrive c",
      db.arrive({ request: "c", action: "read", nowMs: 0 }),
      "connection 3",
    );
    rds.record(
      0,
      "arrive d",
      db.arrive({ request: "d", action: "read", nowMs: 0 }),
      "no connection",
    );
    rds.record(
      15,
      "finish a",
      db.finish({ request: "a", nowMs: 15 }),
      "worker passes to b",
    );
    rds.record(
      15,
      "arrive e",
      db.arrive({ request: "e", action: "read", nowMs: 15 }),
      "a's connection",
    );
    rds.record(30, "finish b", db.finish({ request: "b", nowMs: 30 }));
    rds.record(45, "finish c", db.finish({ request: "c", nowMs: 45 }));
    rds.record(60, "finish e", db.finish({ request: "e", nowMs: 60 }));

    await expect(
      [
        table(
          "Lambda { concurrency: 2, cold start 300 ms, compute 20 ms, idleTimeoutSec: 60 }",
          header,
          lambda.rows,
        ),
        table(
          "RDS { maxConnections: 3, queryWorkers: 1, query 15 ms }",
          header,
          rds.rows,
        ),
      ].join("\n"),
    ).toMatchFileSnapshot("aws-components.txt");
  });

  it("Engine: one request's journey, then a slow database", async () => {
    const constant = (valueMs: number) => ({ kind: "constant", valueMs });
    const edge = (from: string, to: string, timeoutMs: number): Edge => ({
      id: `${from}->${to}`,
      from,
      to,
      latencyMs: 1,
      timeoutMs,
      retry: { maxAttempts: 2, backoff: "none", baseDelayMs: 10 },
    });
    /** Runs one request's worth of events, with the database's query time. */
    const journey = (queryMs: number) => {
      const project: Project = {
        id: "p",
        name: "Journey",
        architecture: {
          components: [
            {
              id: "api",
              type: "api-gateway",
              name: "API",
              config: { ratePerSec: 100, burst: 10, overhead: constant(10) },
            },
            {
              id: "fn",
              type: "lambda",
              name: "Function",
              config: {
                concurrency: 10,
                coldStart: constant(300),
                idleTimeoutSec: 600,
                computeTime: constant(20),
              },
            },
            {
              id: "db",
              type: "rds",
              name: "Database",
              config: {
                maxConnections: 10,
                queryWorkers: 4,
                queryTime: constant(queryMs),
              },
            },
          ],
          edges: [edge("api", "fn", 3_000), edge("fn", "db", 100)],
        },
        workflows: [
          {
            id: "get",
            name: "Get order",
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
            id: "one",
            name: "One request",
            durationMs: 5_000,
            seed: 3,
            mix: [{ workflowId: "get", weight: 1 }],
            profile: [{ atMs: 0, requestsPerSec: 1 }],
          },
        ],
      };
      const events: RequestEvent[] = [];
      simulate({
        project,
        workloadId: "one",
        registry: createAwsComponentRegistry(),
        observer: (e) => {
          if (e.kind !== "tick" && e.requestId === 0) events.push(e);
        },
        untilMs: 20_000,
      });
      const start = events[0]?.timeMs ?? 0;
      const text = journeyText(start);
      return events.map((e) => [
        (e.timeMs - start).toFixed(0),
        ...handleKind(text, e),
      ]);
    };

    const header = ["t(ms)", "where", "what happened"];
    await expect(
      [
        table(
          [
            'Workflow "Get order": api -> fn -> db. Edges: 1 ms each way, 2 attempts,',
            "10 ms between them; fn -> db times out after 100 ms. Times are from the",
            "request's arrival. fn's first invocation is a cold start (300 ms).",
            "",
            "All is well (query: 15 ms):",
          ].join("\n"),
          header,
          journey(15),
        ),
        table("The database is slow (query: 150 ms):", header, journey(150)),
      ].join("\n"),
    ).toMatchFileSnapshot("simulation.txt");
  });

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
      return [
        label,
        String(get.started),
        String(get.succeeded),
        String(get.failed),
        ms(get.latency?.p50Ms),
        ms(get.latency?.p99Ms),
        String(db.peakQueueDepth),
        String(db.gauges["connectionsHeld"]),
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
            "db queue: peak in the row's time. connections: held at the row's end.",
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
