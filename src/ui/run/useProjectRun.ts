import { useCallback, useMemo } from "react";
import { runIsCurrent } from "../../application/run-analysis/run-freshness";
import type { WorkloadRunChecks } from "../../application/run-checks/workload-run-checks";
import type { Project, Workload } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import {
  currentVerdict,
  ranModelOf,
  simulatedSec,
  statusText,
  verdictChipOf,
  type VerdictChipText,
} from "./run-status";
import { runBadgesOf, type RunBadges } from "./run-badges";
import { useRunFindings, type RunMeaning } from "./useRunFindings";
import {
  useSimulationRun,
  type RanModel,
  type SimulationRun,
} from "./useSimulationRun";

/**
 * A project screen's run, for every part of the screen that shows it: the
 * run group, the top bar's status line, and the run's results.
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
  /** The verdict chip beside Run; undefined with no run to show. */
  readonly chip: VerdictChipText | undefined;
  /**
   * True while the latest run's copy of the project differs from the
   * project in what makes its results (ADR-0018); false before the first.
   */
  readonly outOfDate: boolean;
  /** The status badges the diagram draws; undefined before the first run. */
  readonly badges: RunBadges | undefined;
}

/** The picked workload's id, which the screen's view state holds, and its change. */
export interface Picking {
  readonly pickedId: string | undefined;
  readonly pick: (workloadId: string) => void;
}

/**
 * Runs the project's workloads, with the picker on the workload `picking`
 * names (the first, until one is picked), and works out what each run
 * means. Held by the project screen, above the parts that show it, so
 * they all read the same run, and a part that's hidden or swapped (a tab,
 * a narrower window) doesn't stop it.
 */
export function useProjectRun(project: Project, picking: Picking): ProjectRun {
  const run = useSimulationRun(project);
  const checks = useWorkloadChecks(project);
  const [picked, pick] = usePickedWorkload(project, picking);
  const ranModel = ranModelOf(run.phase);
  const meaning = useRunFindings({ ran: ranModel, received: run });
  const { status, chip } = runWords(run, meaning);
  // Memoized, so the two projects are compared when either changes, not
  // on every snapshot.
  const outOfDate = useMemo(
    () => isOutOfDate(ranModel, project),
    [ranModel, project],
  );
  const ran = ranModel?.workload;
  const badges = useBadges(meaning, outOfDate);
  return {
    run,
    picked,
    pick,
    checks,
    ran,
    meaning,
    status,
    chip,
    outOfDate,
    badges,
  };
}

/** The run in words: the status line's text, and the verdict chip's. */
function runWords(
  run: SimulationRun,
  meaning: RunMeaning | undefined,
): Pick<ProjectRun, "status" | "chip"> {
  const wording = {
    phase: run.phase,
    seconds: simulatedSec(run.snapshots),
    verdict: currentVerdict(meaning),
  };
  return { status: statusText(wording), chip: verdictChipOf(wording) };
}

/** The picker's workload, and how to change it. */
type PickedWorkload = readonly [Workload | undefined, ProjectRun["pick"]];

/**
 * The workload the picker shows, from the id the screen's view state
 * holds. It's read from the project each time, so a rename shows in the
 * picker, and a run starts on the workload as it is now. One the project
 * no longer has, as after an undo of its add, gives way to the first.
 */
function usePickedWorkload(project: Project, picking: Picking): PickedWorkload {
  const { pickedId, pick: pickId } = picking;
  const pick = useCallback(
    (workload: Workload) => {
      pickId(workload.id);
    },
    [pickId],
  );
  const picked =
    project.workloads.find((w) => w.id === pickedId) ?? project.workloads[0];
  return [picked, pick];
}

/** Which of the project's workloads can run, and why not. */
function useWorkloadChecks(project: Project): WorkloadRunChecks {
  const { checkWorkloads } = useUseCases();
  return useMemo(
    () => checkWorkloads.execute({ project }),
    [checkWorkloads, project],
  );
}

/** The diagram's badges for the run on screen, the same object while it is. */
function useBadges(
  meaning: RunMeaning | undefined,
  outOfDate: boolean,
): RunBadges | undefined {
  const run = meaning?.run;
  return useMemo(() => runBadgesOf(run, outOfDate), [run, outOfDate]);
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
