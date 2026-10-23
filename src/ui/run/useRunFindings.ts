import { useDeferredValue, useMemo } from "react";
import { createDetectors } from "../../application/run-analysis/findings/create-detectors";
import { createPhrasebook } from "../../application/run-analysis/findings/create-phrasebook";
import {
  findRun,
  type RunFindings,
} from "../../application/run-analysis/findings/find-run";
import type { Phrasebook } from "../../application/run-analysis/findings/phrasebook";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import type { Project, Workload } from "../../domain/model/project";
import type { RunReceived } from "./useSimulationRun";

/** Pure and stateless, so every run panel shares them. */
const detectors = createDetectors();

/** A run so far, what it means, and the phrasebook that words it. */
export interface RunMeaning {
  readonly run: RunSoFar;
  readonly findings: RunFindings;
  readonly phrasebook: Phrasebook;
  /**
   * Whether it's the latest run. For a moment after a new run starts, the
   * deferred copy is still the run before it.
   */
  readonly current: boolean;
}

/**
 * The run to read: its workload, if one has started, and which run it is,
 * with every snapshot received.
 */
export interface UseRunFindingsInput {
  readonly project: Project;
  readonly workload: Workload | undefined;
  readonly received: RunReceived;
}

/** The run to analyze: which one it is, its workload, and its snapshots. */
interface ReceivedRun extends RunReceived {
  readonly workloadId: Workload["id"] | undefined;
}

/**
 * The verdict and findings of the run so far, as the CLI finds them, or
 * undefined before the first run. The run it returns is the one the totals
 * and charts should draw, so they agree with the findings.
 */
export function useRunFindings({
  project,
  workload,
  received: { runId, snapshots },
}: UseRunFindingsInput): RunMeaning | undefined {
  const workloadId = workload?.id;
  const received = useMemo<ReceivedRun>(
    () => ({ runId, workloadId, snapshots }),
    [runId, workloadId, snapshots],
  );
  // Findings and charts take far longer than a snapshot takes to arrive.
  // Reading a deferred copy lets React put clicks (such as Stop) first and
  // skip snapshots it falls behind on; the progress bar, which reads them
  // all, stays current. The run's id and workload are deferred with its
  // snapshots, so the copy never mixes one run's snapshots with another.
  const shown = useDeferredValue(received);
  const phrasebook = useMemo(
    () => createPhrasebook({ project, detectors }),
    [project],
  );
  const analysis = useMemo(() => analyze(project, shown), [project, shown]);
  const current = shown.runId === runId;
  // Memoized too, so the run's results draw again only when it changes.
  return useMemo(
    () => analysis && { ...analysis, phrasebook, current },
    [analysis, phrasebook, current],
  );
}

/** A run and its findings, or undefined before the first run. */
function analyze(
  project: Project,
  { workloadId, snapshots }: ReceivedRun,
): Pick<RunMeaning, "run" | "findings"> | undefined {
  if (workloadId === undefined) return undefined;
  const run = { project, workloadId, snapshots };
  return { run, findings: findRun(run, detectors) };
}
