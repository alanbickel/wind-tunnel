import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../domain/metrics/metrics-snapshot";
import {
  messageText,
  sampleFinding,
  sampleRun,
} from "../../testing/sample-findings";
import { sampleSnapshot } from "../../testing/sample-snapshots";
import { verdictOf } from "./verdict";

/** fn's concurrency of 10, which throttles when full, at `peak`. */
const concurrency = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "concurrency",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 10,
  current: 0,
  peak,
});

/** A limit of 10 that makes work wait, at `peak`. */
const workers = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "workers",
  whenFull: { kind: "wait", holds: undefined },
  limit: 10,
  current: 0,
  peak,
});

// 10 requests start in second 1 and 7 succeed; 2 more succeed in second 5,
// so 1 is still in progress when the 5 s workload ends.
const finished = [
  sampleSnapshot({ second: 1, read: { started: 10, succeeded: 7 } }),
  sampleSnapshot({ second: 2 }),
  sampleSnapshot({ second: 3 }),
  sampleSnapshot({ second: 4 }),
  sampleSnapshot({ second: 5, read: { succeeded: 2 } }),
];

describe("verdictOf", () => {
  // Fails if the counts leave out requests in progress, or the wording
  // drops them.
  it("gives a healthy run's counts, with those still in progress", () => {
    const verdict = verdictOf(sampleRun(finished), []);
    expect(verdict).toMatchObject({
      level: "healthy",
      finished: true,
      title: "Healthy",
      requests: { started: 10, succeeded: 9, failed: 0, inProgress: 1 },
    });
    expect(messageText(verdict.summary)).toBe(
      "All 9 answered requests succeeded; 1 was still in progress when the run ended.",
    );
  });

  // Fails if a run that hasn't reached the workload's end reads as finished.
  it("says 'so far' before the run reaches the end of its workload", () => {
    const verdict = verdictOf(sampleRun(finished.slice(0, 2)), []);
    expect(verdict.title).toBe("Healthy so far");
    expect(messageText(verdict.summary)).toBe(
      "All 7 answered requests succeeded; 3 are in progress.",
    );
  });

  // Fails if the level ignores a severity, or a note raises it.
  it.each([
    [["note"], "healthy"],
    [["note", "warning"], "degraded"],
    [["warning", "failure"], "failing"],
  ] as const)("finds %j %s", (severities, level) => {
    const findings = severities.map((severity) => sampleFinding({ severity }));
    expect(verdictOf(sampleRun(finished), findings).level).toBe(level);
  });

  // Fails if a degraded run's summary doesn't say why it isn't healthy.
  it("counts the warnings of a degraded run", () => {
    const verdict = verdictOf(sampleRun(finished), [
      sampleFinding({ severity: "warning" }),
    ]);
    expect(messageText(verdict.summary)).toBe(
      "All 9 answered requests succeeded, but 1 finding is a warning; 1 was still in progress when the run ended.",
    );
  });

  // Fails if a failing run gets a headroom line: a limit already refused.
  it("gives a failing run its failures and no headroom", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        read: { started: 4, succeeded: 3, failed: 1 },
        fn: { limits: [concurrency(10)] },
      }),
    ];
    const verdict = verdictOf(sampleRun(snapshots), [
      sampleFinding({ severity: "failure" }),
    ]);
    expect(messageText(verdict.summary)).toBe(
      "1 of 4 answered requests failed (0.25).",
    );
    expect(verdict.headroom).toBeUndefined();
    expect(verdict.headroomLine).toBeUndefined();
  });

  // Fails if "answered" counts requests still in progress.
  it("says when no request has been answered", () => {
    const snapshots = [sampleSnapshot({ second: 1, read: { started: 3 } })];
    expect(messageText(verdictOf(sampleRun(snapshots), []).summary)).toBe(
      "No request has been answered yet; 3 are in progress.",
    );
  });
});

describe("the verdict's headroom", () => {
  // Fails if a limit that makes work wait can be "closest to failing":
  // waiting is what it's for.
  it("names the limit that refuses with the highest share, not one that waits", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        fn: { limits: [concurrency(4)] },
        table: { limits: [workers(10)] },
      }),
    ];
    const line = verdictOf(sampleRun(snapshots), []).headroomLine ?? [];
    expect(messageText(line)).toBe(
      "Closest to failing: fn concurrency, at most 4 of 10 (0.4).",
    );
  });

  // Fails if a peak that came only while fn cold-started is given without
  // that context, or hidden in favor of the warm peak.
  it("gives a peak that came only during cold starts with its context", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        fn: { limits: [concurrency(6)], counters: { coldStarts: 6 } },
      }),
      sampleSnapshot({ second: 2, fn: { limits: [concurrency(3)] } }),
    ];
    const line = verdictOf(sampleRun(snapshots), []).headroomLine ?? [];
    expect(messageText(line)).toBe(
      "Closest to failing: fn concurrency, at most 6 of 10 (0.6) from 0ms to 1000ms, while fn had 6 cold starts; at most 3 of 10 (0.3) in the seconds without cold starts.",
    );
  });

  // Fails if the warm-up context appears when the peak also came in a
  // second without cold starts.
  it("leaves the context out when the peak also came while warm", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        fn: { limits: [concurrency(6)], counters: { coldStarts: 6 } },
      }),
      sampleSnapshot({ second: 2, fn: { limits: [concurrency(6)] } }),
    ];
    expect(
      verdictOf(sampleRun(snapshots), []).headroom?.warmUp,
    ).toBeUndefined();
  });

  // Fails if a caller's cold starts (one hop up the edges) don't count, as
  // fn-orders' don't for orders-db in Template A's steady day.
  it("counts the cold starts of a component that calls the limit's", () => {
    const snapshots = [
      sampleSnapshot({
        second: 1,
        fn: { counters: { coldStarts: 2 } },
        table: { limits: [{ ...concurrency(5), name: "connections" }] },
      }),
      sampleSnapshot({
        second: 2,
        table: { limits: [{ ...concurrency(1), name: "connections" }] },
      }),
    ];
    const warmUp = verdictOf(sampleRun(snapshots), []).headroom?.warmUp;
    expect([...(warmUp?.coldStarts ?? [])]).toEqual([["fn", 2]]);
  });

  // Fails if a bucket's line gives its flow in place of its level, or
  // leaves the flow out.
  it("gives a rate limit's level, with its busiest flow as context", () => {
    const requestRate: LimitUse = {
      kind: "rate",
      name: "requestRate",
      whenFull: { kind: "refuse", reason: "throttled" },
      limit: 100,
      current: 0,
      peak: 90,
      ratePerSec: 50,
      takenPerSec: 70,
    };
    const snapshots = [
      sampleSnapshot({ second: 1, api: { limits: [requestRate] } }),
    ];
    const line = verdictOf(sampleRun(snapshots), []).headroomLine ?? [];
    expect(messageText(line)).toBe(
      "Closest to failing: api requestRate, at most 90 of 100 tokens drawn (0.9); its busiest second took 70 tokens, against a refill of 50 a second.",
    );
  });
});
