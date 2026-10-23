import { beforeAll, describe, expect, it } from "vitest";
import { createDetectors } from "../../../application/run-analysis/findings/create-detectors";
import {
  findRun,
  type RunFindings,
} from "../../../application/run-analysis/findings/find-run";
import { BACKLOG } from "../../../application/run-analysis/findings/detectors/backlog";
import type { Finding } from "../../../application/run-analysis/findings/finding";
import type { MetricsRun } from "../../../domain/metrics/metrics-collector";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import { withConsumerMaxConcurrency } from "../testing/rejection-runs";
import { RUN_TIMEOUT_MS } from "../testing/run-template";
import { projectB, runScenario } from "../testing/scenario-runs";

// Template B's lunch rush with 12 consumers instead of 15: the backlog
// outlasts the run, so messages are still waiting when it ends. That's a
// warning once the run has finished, and a note "so far" before
// (findings.md §3.2). No shipped run ends with messages waiting.

const project = withConsumerMaxConcurrency(projectB, 12);
const workloadId = "lunch-rush";

let run: MetricsRun | undefined;

beforeAll(() => {
  run = runScenario({ project, workloadId, seed: 42 });
}, RUN_TIMEOUT_MS);

/** The findings for the run's first `seconds`, or all of it. */
function findingsFor(seconds?: number): RunFindings {
  if (run === undefined) throw new Error("The run hasn't been made yet");
  const snapshots = run.snapshots.slice(0, seconds);
  return findRun({ project, workloadId, snapshots }, createDetectors());
}

function backlogIn({ findings }: RunFindings): Finding | undefined {
  return findings.find((n) => n.finding.key.kind === BACKLOG)?.finding;
}

/** The value of the evidence whose description starts with `what`. */
function evidence(finding: Finding | undefined, what: string): number {
  const found = finding?.evidence.find((e) => e.what.startsWith(what));
  if (found === undefined) throw new Error(`No evidence "${what}"`);
  return found.value;
}

describe("Template B, lunch rush, 12 consumers", () => {
  // Fails if messages still waiting at the end of a finished run stay a
  // note, aren't counted, or don't make the verdict degraded.
  it("warns of the messages still waiting when the run ended", () => {
    const findings = findingsFor();
    const finding = backlogIn(findings);
    expect(finding).toMatchObject({
      severity: "warning",
      affected: 825,
      summary: { kind: BACKLOG, state: "waiting", waiting: 825 },
      window: { fromMs: 16_000 },
    });
    expect(findings.verdict.title).toBe("Degraded");
  });

  // Fails if the accepted messages don't add up to delivered, waiting, and
  // being delivered, or any of them differs from the collector's totals:
  // "being delivered" is read from the consumers' slots, not as the
  // remainder, so the sum is a check.
  it("adds up the accepted messages, as the totals count them", () => {
    if (run === undefined) throw new Error("The run hasn't been made yet");
    const finding = backlogIn(findingsFor());
    const totals = componentIn(run.totals, "orders-queue");
    const accepted = evidence(finding, "orders-queue: messages accepted");
    const delivered = evidence(finding, "orders-queue: messages delivered");
    const waiting = evidence(finding, "orders-queue: messages waiting");
    const beingDelivered = evidence(
      finding,
      "orders-queue consumerConcurrency: slots held",
    );
    expect([accepted, delivered, waiting]).toEqual([
      totals.completed,
      totals.asyncSucceeded,
      totals.queueDepth,
    ]);
    expect(accepted).toBe(delivered + waiting + beingDelivered);
  });

  // Fails if a run stopped early is judged as finished: its backlog may
  // yet empty, so it's a note, said "so far", and the verdict stays healthy.
  it("keeps the backlog a note, so far, when the run stops early", () => {
    const findings = findingsFor(50);
    const finding = backlogIn(findings);
    expect(finding).toMatchObject({
      severity: "note",
      affected: undefined,
      summary: { kind: BACKLOG, state: "waiting-so-far", waiting: 2_934 },
      window: { fromMs: 16_000 },
    });
    expect(findings.verdict.title).toBe("Healthy so far");
  });
});
