import { useMemo, useState } from "react";
import { runIsCurrent } from "../../application/run-analysis/run-freshness";
import type { WorkloadRunChecks } from "../../application/run-checks/workload-run-checks";
import type { Project, Workload } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import {
  currentVerdict,
  ranModelOf,
  simulatedSec,
  statusText,
} from "./run-status";
import { useRunFindings, type RunMeaning } from "./useRunFindings";
import {
  useSimulationRun,
  type RanModel,
  type SimulationRun,
} from "./useSimulationRun";

/**
 * A project screen's run, for every part of the screen that shows it: the
 * project bar's controls and status, and the run's results.
 */
export interface ProjectRun {
  readonly run: SimulationRun;
  /** The workload the picker shows; undefined if the project has none. */
  readonly picked: Workload | undefined;
  readonly pick: (workload: Workload) => void;
  /** Which of the project's workloads can run, and why not, by ID. */
  readonly checks: WorkloadRunChecks;
  /** The workload the latest run ran, if there has been one. */
  readonly ran: Workload | undefined;
  /** What the latest run means so far; undefined before the first. */
  readonly meaning: RunMeaning | undefined;
  /** The status line's text; empty before the first run. */
  readonly status: string;
  /**
   * True while the latest run's copy of the project differs from the
   * project in what makes its results (ADR-0018); false before the first.
   */
  readonly outOfDate: boolean;
}

/**
 * Runs the project's workloads, starting with the picker on the first, and
 * works out what each run means. Held by the project screen, above the
 * parts that show it, so they all read the same run, and a part that's
 * hidden or swapped (a tab, a narrower window) doesn't stop it.
 */
export function useProjectRun(project: Project): ProjectRun {
  const run = useSimulationRun(project);
  const { checkWorkloads } = useUseCases();
  const checks = useMemo(
    () => checkWorkloads.execute({ project }),
    [checkWorkloads, project],
  );
  const [picked, pick] = useState(project.workloads[0]);
  const ranModel = ranModelOf(run.phase);
  const meaning = useRunFindings({ ran: ranModel, received: run });
  const status = statusText({
    phase: run.phase,
    seconds: simulatedSec(run.snapshots),
    verdict: currentVerdict(meaning),
  });
  // Memoized, so the two projects are compared when either changes, not
  // on every snapshot.
  const outOfDate = useMemo(
    () => isOutOfDate(ranModel, project),
    [ranModel, project],
  );
  const ran = ranModel?.workload;
  return { run, picked, pick, checks, ran, meaning, status, outOfDate };
}

/** Whether there has been a run, and its copy no longer matches `project`. */
function isOutOfDate(ran: RanModel | undefined, project: Project): boolean {
  if (ran === undefined) return false;
  return !runIsCurrent({
    ran: ran.project,
    workloadId: ran.workload.id,
    project,
  });
}
