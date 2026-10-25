import { useState } from "react";
import type { Project, Workload } from "../../domain/model/project";
import {
  currentVerdict,
  simulatedSec,
  statusText,
  workloadOf,
} from "./run-status";
import { useRunFindings, type RunMeaning } from "./useRunFindings";
import { useSimulationRun, type SimulationRun } from "./useSimulationRun";

/**
 * A project screen's run, for every part of the screen that shows it: the
 * project bar's controls and status, and the run's results.
 */
export interface ProjectRun {
  readonly run: SimulationRun;
  /** The workload the picker shows; undefined if the project has none. */
  readonly picked: Workload | undefined;
  readonly pick: (workload: Workload) => void;
  /** The workload the latest run ran, if there has been one. */
  readonly ran: Workload | undefined;
  /** What the latest run means so far; undefined before the first. */
  readonly meaning: RunMeaning | undefined;
  /** The status line's text; empty before the first run. */
  readonly status: string;
}

/**
 * Runs the project's workloads, starting with the picker on the first, and
 * works out what each run means. Held by the project screen, above the
 * parts that show it, so they all read the same run, and a part that's
 * hidden or swapped (a tab, a narrower window) doesn't stop it.
 */
export function useProjectRun(project: Project): ProjectRun {
  const run = useSimulationRun(project);
  const [picked, pick] = useState(project.workloads[0]);
  const ran = workloadOf(run.phase);
  const meaning = useRunFindings({ project, workload: ran, received: run });
  const status = statusText({
    phase: run.phase,
    seconds: simulatedSec(run.snapshots),
    verdict: currentVerdict(meaning),
  });
  return { run, picked, pick, ran, meaning, status };
}
