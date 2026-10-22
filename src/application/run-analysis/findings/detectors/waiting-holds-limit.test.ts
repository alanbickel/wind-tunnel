import { describe, expect, it } from "vitest";
import type {
  ComponentMetrics,
  LimitUse,
} from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { FindingsCatalog } from "../catalog/type-advice";
import { createDetectors } from "../create-detectors";
import type { DetectedFinding, Fix } from "../finding";
import { findRun } from "../find-run";
import { say } from "../message";
import { waitingHoldsLimitDetector } from "./waiting-holds-limit";

const detector = waitingHoldsLimitDetector(createFindingsCatalog());

/** table's 2 workers; a request waiting for one holds one of its slots. */
const workers = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "workers",
  whenFull: { kind: "wait", holds: "slots" },
  limit: 2,
  current: 0,
  peak,
});

/** table's 4 slots, which refuse a request when they're all held. */
const slots = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "slots",
  whenFull: { kind: "refuse", reason: "full" },
  limit: 4,
  current: 0,
  peak,
});

/** One second of table, with its workers and slots at these peaks. */
function second(
  n: number,
  [workerPeak, slotPeak]: readonly [number, number],
  table: Partial<ComponentMetrics> = {},
) {
  return sampleSnapshot({
    second: n,
    table: { limits: [workers(workerPeak), slots(slotPeak)], ...table },
  });
}

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
}

// The workers fill alone in second 1, then again from second 3; requests
// wait, and in seconds 4 and 5 they hold all 4 slots.
const slotsRanOut = [
  second(1, [2, 2]),
  second(2, [1, 1]),
  second(3, [2, 3], { peakQueueDepth: 1 }),
  second(4, [2, 4], { peakQueueDepth: 2, completed: 2, arrivals: 6 }),
  second(5, [2, 4], { peakQueueDepth: 2, completed: 2, arrivals: 4 }),
  second(6, [1, 1]),
];

// The workers are full in seconds 2 and 3, but the slots never run out.
const slotsHeld = [
  second(1, [1, 1]),
  second(2, [2, 3], { peakQueueDepth: 1, completed: 2, arrivals: 3 }),
  second(3, [2, 3], { peakQueueDepth: 1, completed: 2, arrivals: 3 }),
  second(4, [1, 1]),
];

describe("waiting-holds-limit", () => {
  // Fails if the note is about the held limit rather than the waiting one,
  // explains anything but the held limit, or counts what it explains.
  it("notes the waiting limit and explains the limit its waiting work holds", () => {
    const [finding] = detector.detect(sampleRun(slotsRanOut));
    expect(finding).toMatchObject({
      key: {
        kind: "waiting-holds-limit",
        componentId: "table",
        reason: undefined,
        limitName: "workers",
      },
      severity: "note",
      limitNames: ["workers"],
      explains: { componentId: "table", limitName: "slots" },
      affected: undefined,
    });
  });

  // Fails if the cause window starts at the workers' first second out
  // (second 1, which didn't lead in) or at the slots' first, or the window
  // isn't the seconds with both out.
  it("starts its cause where the run of full workers that led in began", () => {
    const [finding] = detector.detect(sampleRun(slotsRanOut));
    expect(finding?.window).toEqual({ fromMs: 3_000, toMs: 5_000 });
    expect(finding?.causeWindow).toEqual({ fromMs: 2_000, toMs: 5_000 });
  });

  // Fails if a quoted number is read from the wrong seconds: the busy run
  // from the whole span, the flow from the seconds with only the workers
  // out, or the waiting from a second with the workers free.
  it("quotes when waiting began, running plus waiting, and the flow", () => {
    expect(sentences(detector.detect(sampleRun(slotsRanOut))[0])).toEqual([
      "Requests waited for table's workers, holding its slots while they waited.",
      "All 2 of its workers were busy in every second from 2000ms to 5000ms, so requests arriving then waited for one. They were also all busy in 1 other second.",
      "Each waiting request holds one of its slots: 2 running and up to 2 waiting is 4, and its slots peaked at 4 of 4.",
      "Its slots ran out while its workers were all busy in 2 seconds from 3000ms to 5000ms, 1000 after the waiting began at 2000ms.",
      "While its workers were all busy and its slots were out, table finished 2 requests a second on average, against 5 arriving.",
    ]);
  });

  // Fails if the note needs the held limit to run out, or gets a cause
  // window with nothing to lead into.
  it("still fires when the held limit never ran out, with no cause window", () => {
    const [finding] = detector.detect(sampleRun(slotsHeld));
    expect(finding?.window).toEqual({ fromMs: 1_000, toMs: 3_000 });
    expect(finding?.causeWindow).toBeUndefined();
    expect(sentences(finding).slice(1)).toEqual([
      "All 2 of its workers were busy in 2 seconds from 1000ms to 3000ms, so requests arriving then waited for one.",
      "Each waiting request holds one of its slots: 2 running and up to 1 waiting is 3, and its slots peaked at 3 of 4.",
      "Its slots never ran out while its workers were all busy.",
      "While its workers were all busy, table finished 2 requests a second on average, against 3 arriving.",
    ]);
  });

  // Fails if findRun hides a note that explains nothing, or nests it
  // beneath a finding it doesn't explain: here, timeouts at the same
  // component, which no limit refused.
  it("shows at the top level when it explains no other finding", () => {
    const timedOut = sampleSnapshot({
      second: 5,
      table: { limits: [workers(1), slots(1)] },
      read: { started: 1, failed: 1, failures: { "table: timeout": 1 } },
    });
    const run = sampleRun([...slotsHeld, timedOut]);
    const { findings } = findRun(run, createDetectors());
    const tree = findings.map((n) => [n.finding.key.kind, n.causes.length]);
    expect(tree).toEqual([
      ["failed-requests", 0],
      ["waiting-holds-limit", 0],
    ]);
  });

  // Fails if a waiting limit that holds nothing gets the note, or a full
  // limit that refuses is read as one that makes work wait.
  it("reads only waiting limits that declare a held limit", () => {
    const holdsNothing: LimitUse = {
      kind: "concurrency",
      name: "workers",
      whenFull: { kind: "wait", holds: undefined },
      limit: 2,
      current: 0,
      peak: 2,
    };
    const run = sampleRun([
      sampleSnapshot({
        second: 1,
        table: { limits: [holdsNothing, slots(4)] },
      }),
    ]);
    expect(detector.detect(run)).toEqual([]);
  });

  // Fails if the advice comes from the held limit's entry, not the waiting
  // limit's own.
  it("carries the advice for the waiting limit", () => {
    const fix = (text: string): Fix => ({
      scope: "wind-tunnel",
      message: say`${text}`,
      claim: { kind: "assumption" },
      fidelityIds: [],
    });
    const own = fix("Add workers.");
    const catalog: FindingsCatalog = new Map([
      [
        "dynamodb",
        {
          type: "dynamodb",
          limits: {
            workers: { fixes: [own], learnMore: "workers" },
            slots: { fixes: [fix("Add slots.")], learnMore: "slots" },
          },
        },
      ],
    ]);
    const [finding] = waitingHoldsLimitDetector(catalog).detect(
      sampleRun(slotsRanOut),
    );
    expect(finding).toMatchObject({ fixes: [own], learnMore: "workers" });
  });
});
