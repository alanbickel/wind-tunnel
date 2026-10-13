import { describe, expect, it } from "vitest";
import { ConcurrencyLimit } from "../behaviors/concurrency-limit";
import { RateLimit } from "../behaviors/rate-limit";
import { EventQueue } from "../engine/event-queue";
import type { Edge, Project } from "../model/project";
import { validateProject } from "../model/validate-project";

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

describe("traces", () => {
  it("EventQueue: earliest first, ties in scheduling order", async () => {
    const queue = new EventQueue<string>();
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
    const limit = new RateLimit({ ratePerSec: 10, burst: 5 });
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
    const limit = new ConcurrencyLimit<string>({
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
          durationSec: 60,
          seed: 1,
          mix: [{ workflowId: "gett", weight: 1 }],
          profile: [
            { atSec: 0, requestsPerSec: 100 },
            { atSec: 0, requestsPerSec: 200 },
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
});
