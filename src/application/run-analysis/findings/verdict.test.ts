import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../domain/metrics/metrics-snapshot";
import { sampleFinding, sampleRun } from "../../testing/sample-findings";
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
  // Fails if the summary statement leaves out the requests in progress, or
  // counts them as answered.
  it("gives a healthy run's counts, with those still in progress", () => {
    const verdict = verdictOf(sampleRun(finished), []);
    expect(verdict).toMatchObject({
      level: "healthy",
      finished: true,
      title: "Healthy",
      requests: { started: 10, succeeded: 9, failed: 0, inProgress: 1 },
    });
    expect(verdict.summary).toEqual({
      kind: "verdict-summary",
      level: "healthy",
      finished: true,
      requests: verdict.requests,
      warnings: 0,
    });
  });

  // Fails if a run that hasn't reached the workload's end reads as finished.
  it("says 'so far' before the run reaches the end of its workload", () => {
    const verdict = verdictOf(sampleRun(finished.slice(0, 2)), []);
    expect(verdict.title).toBe("Healthy so far");
    expect(verdict.summary).toMatchObject({
      finished: false,
      requests: { succeeded: 7, inProgress: 3 },
    });
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
    expect(verdict.summary).toMatchObject({ level: "degraded", warnings: 1 });
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
    expect(verdict.summary).toMatchObject({
      level: "failing",
      requests: { succeeded: 3, failed: 1 },
    });
    expect(verdict.headroom).toBeUndefined();
    expect(verdict.headroomLine).toBeUndefined();
  });

  // Fails if the summary statement counts requests still in progress as
  // answered.
  it("says when no request has been answered", () => {
    const snapshots = [sampleSnapshot({ second: 1, read: { started: 3 } })];
    expect(verdictOf(sampleRun(snapshots), []).summary).toMatchObject({
      requests: { succeeded: 0, failed: 0, inProgress: 3 },
    });
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
    const { headroom, headroomLine } = verdictOf(sampleRun(snapshots), []);
    expect(headroom?.limit).toMatchObject({
      componentId: "fn",
      name: "concurrency",
      peak: 4,
    });
    expect(headroomLine).toEqual({ kind: "closest-to-failing", headroom });
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
    const { headroom } = verdictOf(sampleRun(snapshots), []);
    expect(headroom?.limit.peak).toBe(6);
    expect(headroom?.warmUp).toEqual({
      window: { fromMs: 0, toMs: 1_000 },
      coldStarts: new Map([["fn", 6]]),
      warmPeak: 3,
    });
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
    const { headroom } = verdictOf(sampleRun(snapshots), []);
    expect(headroom?.limit).toMatchObject({
      componentId: "api",
      name: "requestRate",
      peak: 90,
      flow: { ratePerSec: 50, busiestTakenPerSec: 70 },
    });
  });
});

describe("the verdict's no-headroom line", () => {
  /** table's read bucket of 100 tokens, out when `out`. */
  const bucket = (name: string, out: boolean): LimitUse => ({
    kind: "rate",
    name,
    whenFull: { kind: "refuse", reason: "throttled" },
    limit: 100,
    current: 0,
    peak: out ? 99.5 : 40,
    ratePerSec: 50,
    takenPerSec: 70,
  });

  // fn's concurrency is out in seconds 1 and 2, and fn refuses 3 attempts
  // in second 2. It refuses 5 more in second 3, when the limit isn't out.
  // table's read bucket never runs out.
  const refused = [
    sampleSnapshot({
      second: 1,
      fn: { limits: [concurrency(10)] },
      table: { limits: [bucket("readUnits", false)] },
    }),
    sampleSnapshot({
      second: 2,
      fn: { rejected: 3, limits: [concurrency(10)] },
      table: { limits: [bucket("readUnits", false)] },
    }),
    sampleSnapshot({
      second: 3,
      fn: { rejected: 5, limits: [concurrency(6)] },
      table: { limits: [bucket("readUnits", false)] },
    }),
  ];

  // Fails if a limit that ran out and refused work is quoted as headroom,
  // its seconds out or the attempts refused in them are miscounted, or a
  // refusal in a second it wasn't out is counted. Also fails if the
  // "closest to failing" line is dropped while a refusing limit that didn't
  // refuse remains, so both lines can show (findings.md §3.4).
  it("names a refusing limit that ran out and refused, and the closest of the rest", () => {
    const verdict = verdictOf(sampleRun(refused), []);
    const refusing = [
      {
        componentId: "fn",
        limitNames: ["concurrency"],
        secondsOut: 2,
        window: { fromMs: 0, toMs: 2_000 },
        rejected: 3,
      },
    ];
    expect(verdict.noHeadroom).toEqual(refusing);
    expect(verdict.noHeadroomLine).toEqual({ kind: "no-headroom", refusing });
    expect(verdict.headroom?.limit).toMatchObject({
      componentId: "table",
      name: "readUnits",
      peak: 40,
    });
  });

  // Fails if a limit that reached its size without refusing loses its
  // "closest to failing" line: it still has headroom of 0, not refusals.
  it("keeps a limit that reached its size but refused nothing as closest to failing", () => {
    const full = [
      sampleSnapshot({ second: 1, fn: { limits: [concurrency(10)] } }),
    ];
    const verdict = verdictOf(sampleRun(full), []);
    expect(verdict.noHeadroomLine).toBeUndefined();
    expect(verdict.headroom?.limit).toMatchObject({
      componentId: "fn",
      name: "concurrency",
      peak: 10,
    });
  });

  // Fails if two limits of one component that ran out together get a count
  // each (rejected doesn't split refusals by limit), or the headroom line
  // stays when every refusing limit refused.
  it("names both of a component's limits that ran out with one count", () => {
    const both = [
      sampleSnapshot({
        second: 1,
        table: {
          rejected: 4,
          limits: [bucket("readUnits", true), bucket("writeUnits", true)],
        },
      }),
    ];
    const verdict = verdictOf(sampleRun(both), []);
    expect(verdict.noHeadroom).toEqual([
      {
        componentId: "table",
        limitNames: ["readUnits", "writeUnits"],
        secondsOut: 1,
        window: { fromMs: 0, toMs: 1_000 },
        rejected: 4,
      },
    ]);
    expect(verdict.headroomLine).toBeUndefined();
  });

  // Fails if a failing run gets the line: its failure findings name the
  // limits that refused.
  it("leaves the line out of a failing run", () => {
    const verdict = verdictOf(sampleRun(refused), [
      sampleFinding({ severity: "failure" }),
    ]);
    expect(verdict.noHeadroom).toEqual([]);
    expect(verdict.noHeadroomLine).toBeUndefined();
  });
});
