import { describe, expect, it } from "vitest";
import type {
  ComponentMetrics,
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { FindingsCatalog, TypeAdvice } from "../catalog/type-advice";
import type { DetectedFinding, Fix } from "../finding";
import { say } from "../message";
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

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
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
  // the failures is misread.
  it("quotes the queue's attempts, which add up, and when the failures stopped", () => {
    const [finding] = detector.detect(sampleRun(recovered));
    expect(sentences(finding)).toEqual([
      "table refused 3 deliveries from fn with throttled, and each went back to be tried again.",
      "That's 3 of fn's 52 delivery attempts (0.057692307692307696). Of those, 47 were delivered, 3 failed, and 2 were still being delivered.",
      "A failed delivery waits in the backlog again: fn had up to 9 messages waiting in a second with one of these failures.",
      "table's readUnits bucket, which holds 100 tokens, had less than one left in every second with these failures.",
      "table refused 3 attempts, and each one failed a delivery.",
      "The last failed in the second ending at 3000ms, and none failed in the 2000 after it.",
      "At the end of the last second, fn had no messages waiting.",
    ]);
  });

  // Fails if a delivery failing in a finished run's last second stays a
  // note, or one failing in the last second so far of a run that's still
  // going (or was stopped) is made a warning.
  it.each([
    {
      run: "finished",
      seconds: 5,
      severity: "warning",
      end: "Deliveries were still failing with it in the run's last second, so nothing in the run says those messages will land.",
    },
    {
      run: "stopped early",
      seconds: 4,
      severity: "note",
      end: "Deliveries are still failing with it.",
    },
  ] as const)(
    "is a $severity when a delivery failed in the last second of a $run run",
    ({ seconds, severity, end }) => {
      const snapshots = recovered.slice(0, seconds - 1);
      const last = second({
        second: seconds,
        delivered: 5,
        failed: 1,
        depth: 3,
      });
      const [finding] = detector.detect(sampleRun([...snapshots, last]));
      expect(finding?.severity).toBe(severity);
      expect(sentences(finding)).toContain(end);
      expect(sentences(finding)).toContain(
        "At the end of the last second, fn had 3 messages waiting.",
      );
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
    expect(sentences(finding)).toContain(
      "No limit of table refuses with throttled, so the run can't say what ran out.",
    );
  });

  // Fails if a timeout is worded as a refusal, or no finding is made for it.
  it("says a timed-out delivery's component didn't answer in time", () => {
    const timedOut = sampleSnapshot({
      second: 1,
      fn: { asyncFailed: 1, asyncFailures: { "table: timeout": 1 } },
    });
    const [finding] = detector.detect(sampleRun([timedOut]));
    expect(finding?.key.reason).toBe("timeout");
    expect(messageText(finding?.summary ?? [])).toBe(
      "1 delivery from fn failed because table didn't answer in time, and it went back to be tried again.",
    );
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
        },
      ],
      [
        "dynamodb",
        {
          type: "dynamodb",
          limits: { readUnits: { fixes: [provision], learnMore: "reads" } },
          kinds: {},
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
