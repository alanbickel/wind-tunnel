import { describe, expect, it } from "vitest";
import type { WhenFull } from "../../../../domain/components/component-behavior";
import type {
  ComponentMetrics,
  LimitUse,
  MetricsSnapshot,
} from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { DetectedFinding } from "../finding";
import { backlogDetector } from "./backlog";

const detector = backlogDetector(createFindingsCatalog());

const WAITS: WhenFull = { kind: "wait", holds: undefined };

/** One second of table, a queue whose 4 consumers make messages wait. */
interface QueueSecond {
  readonly second: number;
  /** Consumers busy at the second's end, and at most during it. */
  readonly current: number;
  readonly peak: number;
  /** Messages waiting at the second's end, and at most during it. */
  readonly depth: number;
  readonly peakDepth: number;
  /** Messages that arrived, all accepted, and that were delivered. */
  readonly arrivals?: number;
  readonly delivered?: number;
  /** The slowest delivery; the p99 is 100 ms under it. */
  readonly slowestMs?: number;
  readonly whenFull?: WhenFull;
}

function second(s: QueueSecond): MetricsSnapshot {
  const { arrivals = 0, delivered = 0, slowestMs, whenFull = WAITS } = s;
  const consumers: LimitUse = {
    kind: "concurrency",
    name: "consumers",
    whenFull,
    limit: 4,
    current: s.current,
    peak: s.peak,
  };
  const table: Partial<ComponentMetrics> = {
    arrivals,
    completed: arrivals,
    asyncSucceeded: delivered,
    queueDepth: s.depth,
    peakQueueDepth: s.peakDepth,
    asyncLatency:
      slowestMs === undefined
        ? undefined
        : {
            count: delivered,
            p50Ms: 100,
            p95Ms: slowestMs - 100,
            p99Ms: slowestMs - 100,
            maxMs: slowestMs,
          },
    limits: [consumers],
  };
  return sampleSnapshot({ second: s.second, table });
}

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
}

// The consumers are all busy in second 1 (warming up), and again from
// second 3. Messages wait within second 3, then at the ends of seconds 4
// and 5, up to 9 at once in second 5. The backlog empties in second 6.
// From second 4, each second's end adds up: accepted = delivered +
// waiting + consumers busy.
const start = [
  second({ second: 1, current: 1, peak: 4, depth: 0, peakDepth: 1 }),
  // Second 2's delivery is slower than any with a backlog.
  second({
    second: 2,
    current: 2,
    peak: 3,
    depth: 0,
    peakDepth: 0,
    arrivals: 1,
    delivered: 1,
    slowestMs: 5_000,
  }),
  second({ second: 3, current: 4, peak: 4, depth: 0, peakDepth: 2 }),
  second({
    second: 4,
    current: 4,
    peak: 4,
    depth: 5,
    peakDepth: 6,
    arrivals: 13,
    delivered: 4,
    slowestMs: 1_600,
  }),
  second({
    second: 5,
    current: 4,
    peak: 4,
    depth: 8,
    peakDepth: 9,
    arrivals: 9,
    delivered: 6,
    slowestMs: 2_600,
  }),
];
const emptied = [
  ...start,
  second({
    second: 6,
    current: 2,
    peak: 4,
    depth: 0,
    peakDepth: 8,
    arrivals: 2,
    delivered: 12,
    slowestMs: 3_200,
  }),
];
// The same, but 3 messages are still waiting when the run ends, and all 4
// consumers are delivering: 25 accepted = 18 delivered + 3 + 4.
const stillWaiting = [
  ...start,
  second({
    second: 6,
    current: 4,
    peak: 4,
    depth: 3,
    peakDepth: 8,
    arrivals: 2,
    delivered: 7,
    slowestMs: 3_200,
  }),
];

describe("backlog", () => {
  // Fails if the note isn't about the limit, doesn't explain it, counts
  // what it delayed, or spans other seconds than those with a backlog and
  // the second it emptied in.
  it("notes a backlog that emptied, explaining its limit", () => {
    const [finding] = detector.detect(sampleRun(emptied));
    expect(finding).toMatchObject({
      key: {
        kind: "backlog",
        componentId: "table",
        reason: undefined,
        limitName: "consumers",
      },
      severity: "note",
      limitNames: ["consumers"],
      explains: { componentId: "table", limitName: "consumers" },
      affected: undefined,
      window: { fromMs: 3_000, toMs: 6_000 },
    });
  });

  // Fails if the cause window starts anywhere but the first second of the
  // unbroken run with the limit out that leads into the backlog: second 1's
  // is a separate run, and second 3 had no message waiting at its end.
  it("starts its cause where the limit ran out", () => {
    const [finding] = detector.detect(sampleRun(emptied));
    expect(finding?.causeWindow).toEqual({ fromMs: 2_000, toMs: 6_000 });
  });

  // Fails if the peak or its second drift, the flow covers seconds past the
  // peak's, or the latency includes a second without a backlog.
  it("quotes when the limit was out, the peak, the flow up to it, and the slowest delivery", () => {
    expect(sentences(detector.detect(sampleRun(emptied))[0])).toEqual([
      "Messages waited for table's consumers from 3000ms, and its backlog was empty by 6000ms.",
      "All 4 of its consumers were busy in every second from 2000ms to 6000ms, so messages arriving then waited for one. They were also all busy in 1 other second.",
      "It peaked at 9 messages in the second ending at 5000ms. From 3000ms to then, messages arrived at 11 a second and were delivered at 5, so it grew by about 6 a second.",
      "Deliveries in those seconds landed up to 3200 after their requests; the highest p99 of a second was 3100.",
    ]);
  });

  // Fails if messages still waiting at the end of a finished run aren't a
  // warning, aren't counted, or the accepted messages don't add up.
  it("warns when messages are still waiting at the end of a finished run", () => {
    const [finding] = detector.detect(sampleRun(stillWaiting));
    expect(finding).toMatchObject({ severity: "warning", affected: 3 });
    const text = sentences(finding);
    expect(text[0]).toBe(
      "Messages waited for table's consumers from 3000ms, and 3 were still waiting when the run ended.",
    );
    expect(text.at(-1)).toBe(
      "When the run ended, 3 messages were still waiting: of the 25 accepted, 18 had been delivered and 4 were being delivered.",
    );
  });

  // Fails if a run stopped early is judged as if it had finished: its
  // backlog may yet empty, so it's a note, said "so far". The sample's
  // workload lasts 5 s, so 4 seconds haven't finished it.
  it("keeps a backlog a note, so far, while the run hasn't finished", () => {
    const [finding] = detector.detect(sampleRun(start.slice(0, 4)));
    expect(finding).toMatchObject({ severity: "note", affected: undefined });
    const text = sentences(finding);
    expect(text[0]).toBe(
      "Messages waited for table's consumers from 3000ms, and 5 are still waiting so far.",
    );
    expect(text.at(-1)).toBe(
      "So far, 5 messages are waiting: of the 14 accepted, 5 have been delivered and 4 are being delivered.",
    );
  });

  // Fails if messages waiting only within a second, never at its end, count
  // as a backlog (Template B's steady day, findings.md §1.6).
  it("says nothing when no second ended with messages waiting", () => {
    const run = sampleRun([
      second({ second: 1, current: 4, peak: 4, depth: 0, peakDepth: 3 }),
      second({ second: 2, current: 1, peak: 2, depth: 0, peakDepth: 0 }),
    ]);
    expect(detector.detect(run)).toEqual([]);
  });

  // Fails if a limit whose waiting work holds another limit (RDS
  // queryWorkers, which waiting-holds-limit explains), or one that refuses,
  // is read as a backlog, or a backlog is noted for a limit that never ran
  // out.
  it("reads only a waiting limit that holds nothing and ran out", () => {
    const holds: WhenFull = { kind: "wait", holds: "connections" };
    const refuses: WhenFull = { kind: "refuse", reason: "full" };
    const withLimit = (whenFull: WhenFull) =>
      emptied.map((s, i) =>
        second({
          second: i + 1,
          current: 4,
          peak: 4,
          depth: s.components.table?.queueDepth ?? 0,
          peakDepth: 1,
          whenFull,
        }),
      );
    expect(detector.detect(sampleRun(withLimit(holds)))).toEqual([]);
    expect(detector.detect(sampleRun(withLimit(refuses)))).toEqual([]);
    const neverOut = emptied.map((s, i) =>
      second({
        second: i + 1,
        current: 1,
        peak: 3,
        depth: s.components.table?.queueDepth ?? 0,
        peakDepth: 1,
      }),
    );
    expect(detector.detect(sampleRun(neverOut))).toEqual([]);
  });
});
