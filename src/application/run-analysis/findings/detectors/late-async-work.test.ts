import { describe, expect, it } from "vitest";
import {
  PERCENTILE_ERROR,
  type LatencySummary,
} from "../../../../domain/metrics/latency-histogram";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import type { Project, Step } from "../../../../domain/model/project";
import { sampleRecord } from "../../../testing/sample-record";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { FindingsCatalog } from "../catalog/type-advice";
import type { Fix } from "../finding";
import { say } from "../message";
import { lateAsyncWorkDetector } from "./late-async-work";

const detector = lateAsyncWorkDetector(createFindingsCatalog());

/** `sampleRecord`'s project, with its one workflow's root step replaced. */
function withRoot(root: Step): Project {
  const { project } = sampleRecord;
  const [read] = project.workflows;
  if (read === undefined) throw new Error("no workflow");
  return { ...project, workflows: [{ ...read, root }] };
}

// api calls fn, which queues work in `table`; the api->fn edge waits 29 s.
const queued = withRoot({
  componentId: "api",
  action: "invoke",
  calls: [
    {
      componentId: "fn",
      action: "invoke",
      calls: [
        {
          componentId: "table",
          action: "enqueue",
          async: { componentId: "fn", action: "invoke" },
        },
      ],
    },
  ],
});

function latency(p99Ms: number): LatencySummary {
  return { count: 10, p50Ms: 1_000, p95Ms: p99Ms, p99Ms, maxMs: p99Ms + 1_000 };
}

/** A second whose deliveries landed with a p99 of `p99Ms`. */
function second(
  n: number,
  p99Ms: number,
  limits: readonly LimitUse[] = [],
): MetricsSnapshot {
  return sampleSnapshot({
    second: n,
    read: { latency: latency(50) },
    table: { asyncLatency: latency(p99Ms), limits },
  });
}

// Second 1 is over the 29 s timeout but within the histogram's 5%; second
// 2 is clear of it; second 3 is exactly at the timeout, which isn't over.
const late = [second(1, 30_000), second(2, 40_000), second(3, 29_000)];

function run(project: Project, snapshots: readonly MetricsSnapshot[]) {
  return { project, workloadId: "steady", snapshots };
}

describe("late-async-work", () => {
  // Fails if the window includes a second whose p99 only reaches the
  // timeout, or the finding counts what the histogram can't.
  it("warns from the first to the last second whose p99 is over the entry edge's timeout", () => {
    const [finding] = detector.detect(run(queued, late));
    expect(finding).toMatchObject({
      key: {
        kind: "late-async-work",
        componentId: "table",
        reason: undefined,
        limitName: undefined,
      },
      severity: "warning",
      window: { fromMs: 0, toMs: 2_000 },
      affected: undefined,
    });
  });

  // Fails if a second within the histogram's error is reported as clearly
  // over, or the slowest delivery isn't the exact maximum.
  it("quotes the slowest delivery and says which seconds are within the error", () => {
    const [finding] = detector.detect(run(queued, late));
    const wait = { from: "api", to: "fn", timeoutMs: 29_000 };
    expect(finding?.summary).toEqual({
      kind: "late-async-work",
      queueId: "table",
      slowestMs: 41_000,
      wait,
    });
    expect(finding?.reasons).toEqual([
      {
        kind: "late-seconds",
        over: 2,
        window: { fromMs: 0, toMs: 2_000 },
        timeoutMs: 29_000,
        highestP99Ms: 40_000,
      },
      {
        kind: "late-near-timeout",
        near: 1,
        timeoutMs: 29_000,
        percentileError: PERCENTILE_ERROR,
      },
      {
        kind: "answered-quickly",
        answered: [{ workflowId: "read", p99Ms: 50 }],
      },
      { kind: "no-synchronous-wait", wait },
    ]);
  });

  // Fails if a p99 equal to the timeout counts as over it.
  it("finds nothing while every p99 is within the timeout", () => {
    expect(detector.detect(run(queued, [second(1, 29_000)]))).toEqual([]);
  });

  // Fails if work queued straight from the entry point, which no
  // synchronous caller waits on through an edge, is compared with a timeout.
  it("skips a workflow whose entry point calls nothing", () => {
    const direct = withRoot({
      componentId: "table",
      action: "enqueue",
      async: { componentId: "fn", action: "invoke" },
    });
    expect(detector.detect(run(direct, late))).toEqual([]);
  });

  // Fails if the advice, or the limits the finding is about, include a limit
  // that didn't run out (idle), or one that refuses rather than makes work
  // wait (refusing).
  it("is about the queue's waiting limits that ran out, with their advice", () => {
    const fix: Fix = {
      scope: "wind-tunnel",
      message: say`Add consumers.`,
      claim: { kind: "assumption" },
      fidelityIds: [],
    };
    const otherFix: Fix = { ...fix, message: say`Raise the rate.` };
    const catalog: FindingsCatalog = new Map([
      [
        "dynamodb",
        {
          type: "dynamodb",
          kinds: {},
          wording: { reasons: {}, limits: {} },
          limits: {
            refusing: { fixes: [otherFix], learnMore: "refusing" },
            consumers: { fixes: [fix], learnMore: "consumers" },
            idle: { fixes: [fix], learnMore: "idle" },
          },
        },
      ],
    ]);
    const waiting = (name: string, peak: number): LimitUse => ({
      kind: "concurrency",
      name,
      whenFull: { kind: "wait", holds: undefined },
      limit: 2,
      current: 0,
      peak,
    });
    const refusing: LimitUse = {
      ...waiting("refusing", 2),
      whenFull: { kind: "refuse", reason: "throttled" },
    };
    const limits = [refusing, waiting("consumers", 2), waiting("idle", 1)];
    const snapshots = [second(1, 30_000, limits), second(2, 40_000, limits)];
    const [finding] = lateAsyncWorkDetector(catalog).detect(
      run(queued, snapshots),
    );
    expect(finding).toMatchObject({
      limitNames: ["consumers"],
      fixes: [fix],
      learnMore: "consumers",
    });
  });
});
