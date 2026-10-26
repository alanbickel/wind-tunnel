import { useDeferredValue, useMemo } from "react";
import { createDetectors } from "../../application/run-analysis/findings/create-detectors";
import { createPhrasebook } from "../../application/run-analysis/findings/create-phrasebook";
import {
  findRun,
  type RunFindings,
} from "../../application/run-analysis/findings/find-run";
import type { FindingsWording } from "../../application/run-analysis/findings/findings-wording";
import type { RunSoFar } from "../../application/run-analysis/run-so-far";
import type { Project, Workload } from "../../domain/model/project";
import type { UseCases } from "../app/use-cases";
import { useUseCases } from "../app/useUseCases";
import type { RanModel, RunReceived } from "./useSimulationRun";

/** Pure and stateless, so every run panel shares them. */
const detectors = createDetectors();

/** A run so far, what it means, and how its findings are worded. */
export interface RunMeaning {
  readonly run: RunSoFar;
  readonly findings: RunFindings;
  readonly wording: FindingsWording;
  /**
   * Whether it's the latest run. For a moment after a new run starts, the
   * deferred copy is still the run before it.
   */
  readonly current: boolean;
}

/**
 * The run to read: what it ran, if one has started, and which run it is,
 * with every snapshot received.
 */
export interface UseRunFindingsInput {
  readonly ran: RanModel | undefined;
  readonly received: RunReceived;
}

/**
 * The run to analyze: which one it is, its copy of the project, its
 * workload, and its snapshots.
 */
interface ReceivedRun extends RunReceived {
  readonly project: Project | undefined;
  readonly workloadId: Workload["id"] | undefined;
}

/**
 * The verdict and findings of the run so far, as the CLI finds them, or
 * undefined before the first run. They're found and worded from the run's
 * copy of the project, so they read the same however the project changes
 * since (ADR-0018). The run it returns is the one the totals and charts
 * should draw, so they agree with the findings.
 */
export function useRunFindings({
  ran,
  received: { runId, snapshots },
}: UseRunFindingsInput): RunMeaning | undefined {
  const project = ran?.project;
  const workloadId = ran?.workload.id;
  const received = useMemo<ReceivedRun>(
    () => ({ runId, project, workloadId, snapshots }),
    [runId, project, workloadId, snapshots],
  );
  // Findings and charts take far longer than a snapshot takes to arrive.
  // Reading a deferred copy lets React put clicks (such as Stop) first and
  // skip snapshots it falls behind on; the progress bar, which reads them
  // all, stays current. The run's id, project, and workload are deferred
  // with its snapshots, so the copy never mixes one run's snapshots with
  // another.
  const shown = useDeferredValue(received);
  const { nameComponents } = useUseCases();
  const wording = useMemo(
    () =>
      shown.project && wordingOf({ project: shown.project, nameComponents }),
    [shown.project, nameComponents],
  );
  const analysis = useMemo(() => analyze(shown), [shown]);
  const current = shown.runId === runId;
  // Memoized too, so the run's results draw again only when it changes.
  return useMemo(
    () => analysis && wording && { ...analysis, wording, current },
    [analysis, wording, current],
  );
}

/** The project a run ran, and the use case that names its components. */
interface WordingOfInput {
  readonly project: Project;
  readonly nameComponents: UseCases["nameComponents"];
}

/** How the findings of a run of `project` are worded. */
function wordingOf({
  project,
  nameComponents,
}: WordingOfInput): FindingsWording {
  return {
    phrasebook: createPhrasebook({ project, detectors }),
    nameOf: nameComponents.execute({ project }),
  };
}

/** A run and its findings, or undefined before the first run. */
function analyze({
  project,
  workloadId,
  snapshots,
}: ReceivedRun): Pick<RunMeaning, "run" | "findings"> | undefined {
  if (project === undefined || workloadId === undefined) return undefined;
  const run = { project, workloadId, snapshots };
  return { run, findings: findRun(run, detectors) };
}
