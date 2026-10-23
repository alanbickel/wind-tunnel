import { describe, expect, it } from "vitest";
import type {
  ComponentMetrics,
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import { sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { FindingsCatalog, TypeAdvice } from "../catalog/type-advice";
import type { DetectedFinding, Fix } from "../finding";
import { say } from "../message";
import type { Statement } from "../phrase";
import {
  FAILED_DELIVERIES,
  failedDeliveriesDetector,
} from "./failed-deliveries";

const detector = failedDeliveriesDetector(createFindingsCatalog());

const THROTTLED = "table: throttled";

/** table's read bucket of 100 tokens, out when `out`. */
const readUnits = (out: boolean): LimitUse => ({
  kind: "rate",
  name: "readUnits",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 100,
  current: 0,
  peak: out ? 99.5 : 10,
  ratePerSec: 50,
  takenPerSec: 60,
});

/** fn's 4 consumers, which make messages wait; `current` busy at the end. */
const consumers = (current: number): LimitUse => ({
  kind: "concurrency",
  name: "consumers",
  whenFull: { kind: "wait", holds: undefined },
  limit: 4,
  current,
  peak: 4,
});

/**
 * One second in which fn, standing in for a queue, delivers messages, and
 * table refuses some of those deliveries with `throttled`.
 */
interface DeliverySecond {
  readonly second: number;
  readonly delivered: number;
  /** Deliveries that failed because table refused them. */
  readonly failed?: number;
  readonly peakDepth?: number;
  /** Messages waiting, and consumers busy, at the second's end. */
  readonly depth?: number;
  readonly busy?: number;
  /** table's limits; its read bucket, out when a delivery failed. */
  readonly tableLimits?: readonly LimitUse[];
}

function second(s: DeliverySecond): MetricsSnapshot {
  const { failed = 0, peakDepth = 0, depth = 0, busy = 0 } = s;
  const fn: Partial<ComponentMetrics> = {
    asyncSucceeded: s.delivered,
    asyncFailed: failed,
    asyncFailures: failed === 0 ? {} : { [THROTTLED]: failed },
    peakQueueDepth: peakDepth,
    queueDepth: depth,
    limits: [consumers(busy)],
  };
  const table: Partial<ComponentMetrics> = {
    rejected: failed,
    limits: s.tableLimits ?? [readUnits(failed > 0)],
  };
  return sampleSnapshot({ second: s.second, fn, table });
}

/** The finding's summary, then its reasons. */
function statements(finding: DetectedFinding | undefined): Statement[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons];
}

// table refuses 3 of fn's deliveries in seconds 2 and 3, while its read
// bucket is out, and nothing after. fn ends the run with 2 deliveries in
// progress and nothing waiting: 47 delivered + 3 failed + 2 = 52 attempts.
const recovered = [
  second({ second: 1, delivered: 10 }),
  second({ second: 2, delivered: 8, failed: 2, peakDepth: 6 }),
  second({ second: 3, delivered: 9, failed: 1, peakDepth: 9 }),
  second({ second: 4, delivered: 10, peakDepth: 12 }),
  second({ second: 5, delivered: 10, busy: 2 }),
];

describe("failed-deliveries", () => {
  // Fails if the finding is keyed by the queue rather than the refusing
  // component, doesn't name the refusing limit, spans other seconds than
  // those with a failure, or counts attempts as messages.
  it("notes each cause of failed deliveries at the component that refused them", () => {
    const findings = detector.detect(sampleRun(recovered));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      key: {
        kind: FAILED_DELIVERIES,
        componentId: "table",
        reason: "throttled",
        limitName: undefined,
      },
      severity: "note",
      limitNames: ["readUnits"],
      window: { fromMs: 1_000, toMs: 3_000 },
      causeWindow: undefined,
      explains: undefined,
      affected: undefined,
    });
  });

  // Fails if the attempts don't add up (delivered + failed + being
  // delivered), the backlog is read from a second without a failure, the
  // refusals aren't matched to the deliveries they failed, or the end of
  // the failures is misread, or the summary leaves out when they began.
  it("quotes the queue's attempts, which add up, and when the failures stopped", () => {
    const [finding] = detector.detect(sampleRun(recovered));
    expect(statements(finding)).toEqual([
      {
        kind: "deliveries-refused",
        componentId: "table",
        reason: "throttled",
        failed: 3,
        queueIds: ["fn"],
        seconds: 2,
        window: { fromMs: 1_000, toMs: 3_000 },
      },
      {
        kind: "queue-attempts",
        queueId: "fn",
        failed: 3,
        delivered: 47,
        failedAll: 3,
        beingDelivered: 2,
      },
      { kind: "failed-delivery-waits", queueId: "fn", mostWaiting: 9 },
      {
        kind: "bucket-ran-out",
        componentId: "table",
        limitName: "readUnits",
        limit: 100,
        coverage: { secondsOut: 2, secondsFailing: 2 },
      },
      {
        kind: "refused-attempts-failed",
        componentId: "table",
        rejected: 3,
        ended: "deliveries",
      },
      {
        kind: "deliveries-stopped-failing",
        lastFailedMs: 3_000,
        quietMs: 2_000,
      },
      { kind: "queue-waiting-at-end", queueId: "fn", waiting: 0 },
    ]);
  });

  // Fails if a delivery failing in a finished run's last second stays a
  // note, or one failing in the last second so far of a run that's still
  // going (or was stopped) is made a warning.
  it.each([
    { run: "finished", seconds: 5, severity: "warning", finished: true },
    { run: "stopped early", seconds: 4, severity: "note", finished: false },
  ] as const)(
    "is a $severity when a delivery failed in the last second of a $run run",
    ({ seconds, severity, finished }) => {
      const snapshots = recovered.slice(0, seconds - 1);
      const last = second({
        second: seconds,
        delivered: 5,
        failed: 1,
        depth: 3,
      });
      const [finding] = detector.detect(sampleRun([...snapshots, last]));
      expect(finding?.severity).toBe(severity);
      expect(statements(finding)).toContainEqual({
        kind: "deliveries-still-failing",
        finished,
      });
      expect(statements(finding)).toContainEqual({
        kind: "queue-waiting-at-end",
        queueId: "fn",
        waiting: 3,
      });
    },
  );

  // Fails if a cause that no limit explains gets no finding, or the finding
  // names a limit anyway.
  it("names only the component and reason when no limit refuses with it", () => {
    const unexplained = [
      second({ second: 1, delivered: 10, tableLimits: [] }),
      second({ second: 2, delivered: 8, failed: 2, tableLimits: [] }),
    ];
    const [finding] = detector.detect(sampleRun(unexplained));
    expect(finding?.limitNames).toEqual([]);
    expect(statements(finding)).toContainEqual({
      kind: "no-limit-refuses",
      componentId: "table",
      reason: "throttled",
    });
  });

  // Fails if a timeout is worded as a refusal, or no finding is made for it.
  it("says a timed-out delivery's component didn't answer in time", () => {
    const timedOut = sampleSnapshot({
      second: 1,
      fn: { asyncFailed: 1, asyncFailures: { "table: timeout": 1 } },
    });
    const [finding] = detector.detect(sampleRun([timedOut]));
    expect(finding?.key.reason).toBe("timeout");
    expect(finding?.summary).toEqual({
      kind: "deliveries-timed-out",
      componentId: "table",
      failed: 1,
      queueIds: ["fn"],
      seconds: 1,
      window: { fromMs: 0, toMs: 1_000 },
    });
  });

  // Fails if the kind's advice for the queue's type is left out, comes
  // after the refusing limit's, or its Learn more loses to the limit's.
  it("gives the queue's advice for failed deliveries, then the refusing limit's", () => {
    const fix = (text: string): Fix => ({
      scope: "wind-tunnel",
      message: say`${text}`,
      claim: { kind: "assumption" },
      fidelityIds: [],
    });
    const redrive = fix("Add a dead-letter queue.");
    const provision = fix("Provision more reads.");
    const catalog: FindingsCatalog = new Map<string, TypeAdvice>([
      [
        "lambda",
        {
          type: "lambda",
          limits: {},
          kinds: {
            [FAILED_DELIVERIES]: { fixes: [redrive], learnMore: "dlq" },
          },
          wording: { reasons: {}, limits: {} },
        },
      ],
      [
        "dynamodb",
        {
          type: "dynamodb",
          limits: { readUnits: { fixes: [provision], learnMore: "reads" } },
          kinds: {},
          wording: { reasons: {}, limits: {} },
        },
      ],
    ]);
    const [finding] = failedDeliveriesDetector(catalog).detect(
      sampleRun(recovered),
    );
    expect(finding?.fixes).toEqual([redrive, provision]);
    expect(finding?.learnMore).toBe("dlq");
  });
});
