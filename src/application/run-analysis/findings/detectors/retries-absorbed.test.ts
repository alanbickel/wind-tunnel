import { describe, expect, it } from "vitest";
import type { LatencySummary } from "../../../../domain/metrics/latency-histogram";
import type {
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import type { Project } from "../../../../domain/model/project";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleRecord } from "../../../testing/sample-record";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { DetectedFinding } from "../finding";
import { retriesAbsorbedDetector } from "./retries-absorbed";

const detector = retriesAbsorbedDetector(createFindingsCatalog());

const THROTTLED = "table: throttled";

/** table's read bucket of 100 tokens, `peak` of them drawn. */
const readUnits = (peak: number): LimitUse => ({
  kind: "rate",
  name: "readUnits",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 100,
  current: 0,
  peak,
  ratePerSec: 50,
  takenPerSec: 60,
});

function latency(p99Ms: number): LatencySummary {
  return { count: 10, p50Ms: 10, p95Ms: p99Ms, p99Ms, maxMs: p99Ms };
}

/** One second of the sample run: table's refusals, and Read item's. */
interface RefusalSecond {
  readonly second: number;
  readonly rejected: number;
  /** Read item requests that failed as throttled. */
  readonly failed: number;
  readonly p99Ms: number;
  /** table's other limits, beside its read bucket. */
  readonly limits?: readonly LimitUse[];
}

function second(s: RefusalSecond): MetricsSnapshot {
  const { second: n, rejected, failed, p99Ms, limits = [] } = s;
  return sampleSnapshot({
    second: n,
    read: {
      started: 10,
      succeeded: 10 - failed,
      failed,
      failures: failed === 0 ? {} : { [THROTTLED]: failed },
      latency: latency(p99Ms),
    },
    table: {
      rejected,
      limits: [readUnits(rejected > 0 ? 99.5 : 10), ...limits],
    },
  });
}

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
}

// table refuses 17 attempts in seconds 3 to 5, and 3 requests fail with it.
// Read item's p99 is 100 and 120 before, and 200, 300, and 250 during.
const absorbed = [
  second({ second: 1, rejected: 0, failed: 0, p99Ms: 100 }),
  second({ second: 2, rejected: 0, failed: 0, p99Ms: 120 }),
  second({ second: 3, rejected: 5, failed: 0, p99Ms: 200 }),
  second({ second: 4, rejected: 8, failed: 2, p99Ms: 300 }),
  second({ second: 5, rejected: 4, failed: 1, p99Ms: 250 }),
];

describe("retries-absorbed", () => {
  // Fails if the note is about anything but the refusing component, spans
  // other seconds than those with a refusal, or explains or counts anything.
  it("notes a component that refused more attempts than requests failed", () => {
    const [finding] = detector.detect(sampleRun(absorbed));
    expect(finding).toMatchObject({
      key: {
        kind: "retries-absorbed",
        componentId: "table",
        reason: undefined,
        limitName: undefined,
      },
      severity: "note",
      window: { fromMs: 2_000, toMs: 5_000 },
      causeWindow: undefined,
      explains: undefined,
      affected: undefined,
    });
  });

  // Fails if attempts are equated with requests, a timeout or another
  // component's failures are counted, or the medians are of other seconds
  // (the lower middle of an even count, so it's one second's own p99).
  it("quotes attempts against requests, and the p99 before and during", () => {
    const others = sampleSnapshot({
      second: 6,
      read: {
        started: 2,
        failed: 2,
        failures: { "table: timeout": 1, "fn: throttled": 1 },
        latency: latency(90),
      },
    });
    const [finding] = detector.detect(sampleRun([...absorbed, others]));
    expect(sentences(finding)).toEqual([
      "table refused 17 attempts, but only 3 requests failed with its rejections: callers retried the rest.",
      "It refused attempts in 3 seconds from 2000ms to 5000ms.",
      "Attempts aren't requests: a request refused twice and then served counts as two refused attempts, so the difference isn't how many requests the retries saved.",
      "It refuses only with throttled, so the attempts and the requests are both throttled rejections.",
      "While it refused attempts, Read item's p99 was 250 in the median second, and up to 300, against 100 in the median second before.",
    ]);
  });

  // Fails if the note names the limit, or repeats its fixes, when a failure
  // finding already does.
  it("leaves the limit and its fixes to the failure finding when requests failed", () => {
    const [finding] = detector.detect(sampleRun(absorbed));
    expect(finding?.limitNames).toEqual([]);
    expect(finding?.fixes).toEqual([]);
    expect(finding?.learnMore).toBeUndefined();
  });

  // Fails if a run in which retries hid every refusal gets no note, or the
  // note doesn't name the limit that ran out and carry its fixes: no
  // failure finding shows them.
  it("names the limit and its fixes when retries hid every refusal", () => {
    const hidden = absorbed.map((s, i) =>
      second({
        second: i + 1,
        rejected: s.components.table?.rejected ?? 0,
        failed: 0,
        p99Ms: 100,
      }),
    );
    const [finding] = detector.detect(sampleRun(hidden));
    expect(sentences(finding)[0]).toBe(
      "table refused 17 attempts, but no request failed with its rejections: callers retried every one.",
    );
    expect(finding?.limitNames).toEqual(["readUnits"]);
    expect(finding?.learnMore).toBe(
      "dynamodb-saves-up-unused-capacity-for-bursts",
    );
    expect(finding?.fixes.length).toBeGreaterThan(0);
  });

  // Fails if the note fires when every refused attempt failed a request,
  // or when nothing was refused.
  it("says nothing when no retry got a refused request through", () => {
    const unretried = [
      second({ second: 1, rejected: 2, failed: 2, p99Ms: 100 }),
      second({ second: 2, rejected: 0, failed: 0, p99Ms: 100 }),
    ];
    expect(detector.detect(sampleRun(unretried))).toEqual([]);
    expect(detector.detect(sampleRun(absorbed.slice(0, 1)))).toEqual([]);
  });

  // Fails if the attempts are split by reason, or said to be of one reason,
  // when the component's limits refuse with two.
  it("says it can't split the attempts when the component refuses with several reasons", () => {
    const slots: LimitUse = {
      kind: "concurrency",
      name: "slots",
      whenFull: { kind: "refuse", reason: "full" },
      limit: 4,
      current: 0,
      peak: 1,
    };
    const run = sampleRun([
      second({
        second: 1,
        rejected: 3,
        failed: 1,
        p99Ms: 100,
        limits: [slots],
      }),
    ]);
    expect(sentences(detector.detect(run)[0])).toContain(
      "It refuses with throttled and full, and refused attempts aren't counted by reason, so the run can't say how many of each were retried.",
    );
  });

  // Fails if the latency of a workflow that only hands work off to the
  // component as async is quoted: its requests don't wait for it.
  it("quotes the latency only of workflows whose requests wait for it", () => {
    const [read] = sampleRecord.project.workflows;
    if (read === undefined) throw new Error("no workflow");
    const project: Project = {
      ...sampleRecord.project,
      workflows: [
        {
          ...read,
          root: {
            componentId: "api",
            action: "invoke",
            calls: [
              {
                componentId: "fn",
                action: "invoke",
                async: { componentId: "table", action: "read" },
              },
            ],
          },
        },
      ],
    };
    const run = { ...sampleRun(absorbed), project };
    const text = sentences(detector.detect(run)[0]);
    expect(text).toHaveLength(4);
    expect(text.join(" ")).not.toContain("p99");
  });
});
