import { describe, expect, it } from "vitest";
import { CountingSemaphore } from "../behaviors/counting-semaphore";
import { TokenBucket } from "../behaviors/token-bucket";
import { HeapEventQueue } from "../engine/heap-event-queue";
import type { Edge, Project } from "../model/project";
import { createAwsComponentRegistry } from "../components/aws";
import { simulate } from "../engine/create-simulation";
import type {
  Failure,
  SimulationEvent,
  MetricsTickEvent,
} from "../engine/simulation-events";
import { handleKind, type KindHandlers } from "../shared/kind-handlers";
import { table } from "./format";

// Worked examples for docs/architecture/simulation-engine.md;
// format.ts explains the snapshots. Accept an intended change with
// `npx vitest run -u src/domain/traces/simulation-engine`,
// then check the guide still matches.

/** Every event but ticks: the ones that belong to a request. */
type RequestEvent = Exclude<SimulationEvent, MetricsTickEvent>;

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
    "component-arrived": (e) => [e.componentId, `arrived (${e.action})`],
    "component-queued": (e) => [e.componentId, "queued"],
    "component-started": (e) => [
      e.componentId,
      `started, ${String(e.serviceMs)} ms of work`,
    ],
    "component-rejected": (e) => [e.componentId, `rejected: ${e.reason}`],
    "component-finished": (e) => [
      e.componentId,
      e.failure === undefined
        ? "finished, answer sent"
        : `finished with error (${cause(e.failure)})`,
    ],
    "edge-attempt-failed": (e) => [
      e.edgeId,
      `attempt ${String(e.attempt)} failed (${cause(e.failure)})` +
        (e.retryAtMs === undefined
          ? ", no retries left"
          : `, retry at ${(e.retryAtMs - startMs).toFixed(0)}`),
    ],
    "component-dispatched": (e) => [e.componentId, "dispatched"],
    "component-async-finished": (e) => [
      e.componentId,
      e.failure === undefined
        ? "async work done"
        : `async work failed (${cause(e.failure)})`,
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
          if (e.kind !== "metrics-tick" && e.requestId === 0) events.push(e);
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
});
