import { describe, expect, it } from "vitest";
import { lambdaDefinition, rdsDefinition } from "../components/aws";
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
import { table } from "./format";

// Worked examples for docs/architecture/component-definitions.md;
// format.ts explains the snapshots. Accept an intended change with
// `npx vitest run -u src/domain/traces/component-definitions`,
// then check the guide still matches.

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

describe("traces", () => {
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
});
