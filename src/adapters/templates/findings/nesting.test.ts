import { beforeAll, describe, expect, it } from "vitest";
import { createFindingsCatalog } from "../../../application/run-analysis/findings/catalog/create-findings-catalog";
import type { Detector } from "../../../application/run-analysis/findings/detector";
import { failedRequestsDetector } from "../../../application/run-analysis/findings/detectors/failed-requests";
import { findRun } from "../../../application/run-analysis/findings/find-run";
import type { Finding } from "../../../application/run-analysis/findings/finding";
import { say } from "../../../application/run-analysis/findings/message";
import type { RunSoFar } from "../../../application/run-analysis/run-so-far";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import { projectA, runScenario } from "../testing/scenario-runs";

// Template A's lunch rush should read as one failure (refused connections)
// with its cause, the full query workers, beneath it (findings.md §3.3).
// The query-worker note is a later detector (Roadmap M5, item 8), so a fake
// stands in for it here, and the failed-requests finding is made to cite it.

const NOTE_ID = "fake-waiting:orders-db queryWorkers";

const note: Finding = {
  id: NOTE_ID,
  detectorId: "fake-waiting",
  severity: "note",
  componentId: "orders-db",
  window: { fromMs: 11_000, toMs: 49_000 },
  causeWindow: undefined,
  summary: say`orders-db's query workers were full.`,
  reasons: [],
  evidence: [],
  fixes: [],
  learnMore: undefined,
  causedBy: [],
  affected: undefined,
};

const fakeNote: Detector = { id: "fake-waiting", detect: () => [note] };

/** failed-requests, with each finding citing the fake note as its cause. */
function citingTheNote(): Detector {
  const failed = failedRequestsDetector(createFindingsCatalog());
  return {
    id: failed.id,
    detect: (run) =>
      failed.detect(run).map((f) => ({ ...f, causedBy: [NOTE_ID] })),
  };
}

describe("Template A, lunch rush, with a cause note", () => {
  let run: RunSoFar;
  beforeAll(() => {
    const workloadId = "lunch-rush";
    const { snapshots } = runScenario({
      project: projectA,
      workloadId,
      seed: 42,
    });
    run = { project: projectA, workloadId, snapshots };
  }, RUN_TIMEOUT_MS);

  // Fails if findRun lists a cited finding at the top level as well as
  // beneath the finding that cites it, or drops it.
  it("shows one top-level failure, with its cause beneath it", () => {
    const { findings } = findRun(run, [fakeNote, citingTheNote()]);
    expect(
      findings.map((n) => [n.finding.id, n.causes.map((c) => c.finding.id)]),
    ).toEqual([["failed-requests:orders-db: too-many-connections", [NOTE_ID]]]);
  });
});
