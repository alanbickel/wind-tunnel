import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../../../domain/metrics/metrics-snapshot";
import { messageText, sampleRun } from "../../../testing/sample-findings";
import { sampleSnapshot } from "../../../testing/sample-snapshots";
import { createFindingsCatalog } from "../catalog/create-findings-catalog";
import type { DetectedFinding } from "../finding";
import { bucketDrainedDetector } from "./bucket-drained";

const detector = bucketDrainedDetector(createFindingsCatalog());

/** table's read bucket of 10 tokens, refilling 5 a second. */
interface BucketSecond {
  readonly second: number;
  /** Tokens missing at the second's end. */
  readonly current: number;
  /** Most tokens missing during the second. */
  readonly peak: number;
  readonly takenPerSec: number;
}

function second({ second: n, current, peak, takenPerSec }: BucketSecond) {
  const readUnits: LimitUse = {
    kind: "rate",
    name: "readUnits",
    whenFull: { kind: "refuse", reason: "throttled" },
    limit: 10,
    current,
    peak,
    ratePerSec: 5,
    takenPerSec,
  };
  return sampleSnapshot({ second: n, table: { limits: [readUnits] } });
}

/** Every sentence of the finding, as plain text. */
function sentences(finding: DetectedFinding | undefined): string[] {
  if (finding === undefined) return [];
  return [finding.summary, ...finding.reasons].map(messageText);
}

// Full after second 1; reads take more than the refill from second 2; the
// bucket runs out in seconds 4 and 5, and is refilling in second 6.
const drained = [
  second({ second: 1, current: 0, peak: 0.5, takenPerSec: 4 }),
  second({ second: 2, current: 3, peak: 3, takenPerSec: 7 }),
  second({ second: 3, current: 6, peak: 6, takenPerSec: 8 }),
  second({ second: 4, current: 9.5, peak: 9.5, takenPerSec: 9 }),
  second({ second: 5, current: 9.5, peak: 9.6, takenPerSec: 5 }),
  second({ second: 6, current: 6, peak: 9, takenPerSec: 2 }),
];

describe("bucket-drained", () => {
  // Fails if the note isn't about the bucket, doesn't explain it, or
  // counts what it explains.
  it("notes a bucket that ran out, explaining that bucket", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding).toMatchObject({
      key: {
        kind: "bucket-drained",
        componentId: "table",
        reason: undefined,
        limitName: "readUnits",
      },
      severity: "note",
      limitNames: ["readUnits"],
      explains: { componentId: "table", limitName: "readUnits" },
      affected: undefined,
    });
  });

  // Fails if the cause window starts anywhere but the first second of the
  // run over the refill that led into the first second out, or the window
  // isn't the seconds out.
  it("starts its cause where the drain began", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding?.window).toEqual({ fromMs: 3_000, toMs: 5_000 });
    expect(finding?.causeWindow).toEqual({ fromMs: 1_000, toMs: 5_000 });
  });

  // Fails if the mean flow includes a second outside the drain, the time it
  // lasted isn't bounded by the second it ran out, or the formula drifts
  // from (burst − 1) ÷ (flow − refill).
  it("quotes when it was last full, the flow over the drain, and how long it lasted", () => {
    expect(sentences(detector.detect(sampleRun(drained))[0])).toEqual([
      "table's readUnits bucket drained from 1000ms and ran out in the second ending at 4000ms.",
      "It was last full at 1000ms.",
      "From 1000ms, requests took more tokens than it refills in every second: 8 a second on average, against a refill of 5.",
      "Its burst of 10 tokens lasted between 2000 and 3000.",
      "At that flow, a full bucket lasts about 3000: (burst − 1) ÷ (flow − refill).",
    ]);
  });

  // Fails if a bucket drained within one second gets a cause window, or a
  // formula from a flow no faster than the refill, or a last-full time
  // other than the run's start when it was never full.
  it("says so when the tokens went within the second it ran out", () => {
    const sudden = [
      second({ second: 1, current: 2, peak: 2, takenPerSec: 4 }),
      second({ second: 2, current: 4, peak: 9.5, takenPerSec: 5 }),
    ];
    const [finding] = detector.detect(sampleRun(sudden));
    expect(finding?.causeWindow).toBeUndefined();
    expect(sentences(finding).slice(1)).toEqual([
      "It was last full at 0ms.",
      "In the second it ran out, requests took 5 tokens, no more than its refill of 5 a second, but faster than the refill within the second.",
      "Its burst of 10 tokens lasted between 0 and 1000.",
    ]);
  });

  // Fails if a bucket that never ran out gets a note, or a concurrency
  // limit is read as a bucket.
  it("says nothing of a bucket that never ran out, or of other limits", () => {
    const full: LimitUse = {
      kind: "concurrency",
      name: "slots",
      whenFull: { kind: "refuse", reason: "full" },
      limit: 4,
      current: 4,
      peak: 4,
    };
    const run = sampleRun([
      second({ second: 1, current: 8, peak: 8.5, takenPerSec: 9 }),
      sampleSnapshot({ second: 2, table: { limits: [full] } }),
    ]);
    expect(detector.detect(run)).toEqual([]);
  });

  // Fails if the advice comes from anything but the bucket's own entry
  // (DynamoDB readUnits).
  it("carries the advice for the bucket", () => {
    const [finding] = detector.detect(sampleRun(drained));
    expect(finding?.learnMore).toBe(
      "dynamodb-saves-up-unused-capacity-for-bursts",
    );
    expect(finding?.fixes).toHaveLength(2);
  });
});
