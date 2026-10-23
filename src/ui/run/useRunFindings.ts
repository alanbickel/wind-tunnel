import { useDeferredValue, useMemo } from "react";
import { createDetectors } from "../../application/run-analysis/findings/create-detectors";
import { createPhrasebook } from "../../application/run-analysis/findings/create-phrasebook";
import {
  findRun,
  type RunFindings,
} from "../../application/run-analysis/findings/find-run";
import type { Phrasebook } from "../../application/run-analysis/findings/phrasebook";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project, Workload } from "../../domain/model/project";

/** Pure and stateless, so every run panel shares them. */
const detectors = createDetectors();

/** A run so far, what it means, and the phrasebook that words it. */
export interface RunMeaning {
  readonly run: RunSoFar;
  readonly findings: RunFindings;
  readonly phrasebook: Phrasebook;
}

/**
 * The run to read: its workload, if one has started, and every snapshot
 * received.
 */
export interface UseRunFindingsInput {
  readonly project: Project;
  readonly workload: Workload | undefined;
  readonly snapshots: readonly MetricsSnapshot[];
}

/**
 * The verdict and findings of the run so far, as the CLI finds them, or
 * undefined before the first run. The run it returns is the one the totals
 * and charts should draw, so they agree with the findings.
 */
export function useRunFindings({
  project,
  workload,
  snapshots: received,
}: UseRunFindingsInput): RunMeaning | undefined {
  // Findings and charts take far longer than a snapshot takes to arrive.
  // Reading a deferred copy lets React put clicks (such as Stop) first and
  // skip snapshots it falls behind on; the progress bar, which reads them
  // all, stays current.
  const snapshots = useDeferredValue(received);
  const phrasebook = useMemo(
    () => createPhrasebook({ project, detectors }),
    [project],
  );
  const workloadId = workload?.id;
  return useMemo(() => {
    if (workloadId === undefined) return undefined;
    const run = { project, workloadId, snapshots };
    return { run, findings: findRun(run, detectors), phrasebook };
  }, [project, workloadId, snapshots, phrasebook]);
}
