import { describe, expect, it } from "vitest";
import { createDetectors } from "../../../application/run-analysis/findings/create-detectors";
import {
  findRun,
  type RunFindings,
} from "../../../application/run-analysis/findings/find-run";
import { BACKLOG } from "../../../application/run-analysis/findings/detectors/backlog";
import type { Finding } from "../../../application/run-analysis/findings/finding";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import { withConsumerMaxConcurrency } from "../testing/rejection-runs";
import { projectB } from "../testing/scenario-runs";
import type { RunGetter, TemplateRun } from "../testing/use-run";

// Template B's lunch rush with 12 consumers instead of 15: the backlog
// outlasts the run, so messages are still waiting when it ends. That's a
// warning once the run has finished, and a note "so far" before
// (findings.md §3.2). No shipped run ends with messages waiting.

/** The project of the run this checks: 12 consumers, not 15. */
export const twelveConsumers = withConsumerMaxConcurrency(projectB, 12);

/** The findings for the run's first `seconds`, or all of it. */
function findingsFor(run: TemplateRun, seconds?: number): RunFindings {
  const { project, workloadId } = run;
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

/** Template B's lunch rush with 12 consumers, at its end and part way. */
export function describeBacklogAtEnd(getRun: RunGetter): void {
  describe("the backlog at the end of the lunch rush, 12 consumers", () => {
    // Fails if messages still waiting at the end of a finished run stay a
    // note, aren't counted, or don't make the verdict degraded.
    it("warns of the messages still waiting when the run ended", () => {
      const findings = findingsFor(getRun());
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
      const run = getRun();
      const finding = backlogIn(findingsFor(getRun()));
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
      const findings = findingsFor(getRun(), 50);
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
}
