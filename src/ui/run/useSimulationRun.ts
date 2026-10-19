import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RunSimulationResult } from "../../application/use-cases/run-simulation";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-snapshot";
import type { Project, Workload } from "../../domain/model/project";
import type { UseCases } from "../app/use-cases";
import { useUseCases } from "../app/useUseCases";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";

/** Where the latest run has got to. */
export type RunPhase =
  RunIdle | RunRunning | RunFinished | RunStopped | RunFailed;

/** Nothing has run yet. */
export interface RunIdle {
  readonly status: "idle";
}

export interface RunRunning {
  readonly status: "running";
  readonly workload: Workload;
}

export interface RunFinished {
  readonly status: "finished";
  readonly workload: Workload;
}

/** The user stopped the run; its snapshots so far stay. */
export interface RunStopped {
  readonly status: "stopped";
  readonly workload: Workload;
}

export interface RunFailed {
  readonly status: "failed";
  readonly workload: Workload;
  /** Why, for the user. */
  readonly problem: string;
}

export interface SimulationRun {
  readonly phase: RunPhase;
  /** The latest run's snapshots, in order; they grow while it runs. */
  readonly snapshots: readonly MetricsSnapshot[];
  /** Runs a workload; does nothing while a run is going. */
  readonly start: (workload: Workload) => void;
  /** Stops the run that's going, if any. */
  readonly stop: () => void;
}

/**
 * Runs the project's workloads one at a time, collecting each snapshot as it
 * arrives. Leaving the screen stops the run.
 */
export function useSimulationRun(project: Project): SimulationRun {
  const { runSimulation } = useUseCases();
  const [phase, setPhase] = useState<RunPhase>({ status: "idle" });
  const [snapshots, setSnapshots] = useState<readonly MetricsSnapshot[]>([]);
  // Set while a run is going. State lags a render behind, so a double-click
  // would see the phase as idle twice; the ref changes at once.
  const going = useRef<AbortController>(undefined);

  useEffect(
    () => () => {
      going.current?.abort();
    },
    [],
  );

  const start = useCallback(
    (workload: Workload) => {
      if (going.current !== undefined) return;
      const controller = new AbortController();
      going.current = controller;
      const context = { runSimulation, project, setPhase, setSnapshots };
      void runWorkload({ workload, controller }, context).finally(() => {
        going.current = undefined;
      });
    },
    [project, runSimulation],
  );

  const stop = useCallback(() => {
    going.current?.abort();
  }, []);

  return { phase, snapshots, start, stop };
}

interface RunWorkloadInput {
  readonly workload: Workload;
  /** Its signal stops the run. */
  readonly controller: AbortController;
}

/** What every run of the hook shares. */
interface RunWorkloadContext {
  readonly runSimulation: UseCases["runSimulation"];
  readonly project: Project;
  readonly setPhase: (phase: RunPhase) => void;
  readonly setSnapshots: Dispatch<SetStateAction<readonly MetricsSnapshot[]>>;
}

/** Starts a run afresh, collects its snapshots, and records how it ended. */
function runWorkload(
  { workload, controller }: RunWorkloadInput,
  { runSimulation, project, setPhase, setSnapshots }: RunWorkloadContext,
): Promise<void> {
  setPhase({ status: "running", workload });
  setSnapshots([]);
  const attempt = runSimulation.execute({
    project,
    workloadId: workload.id,
    stopSignal: controller.signal,
    onSnapshot: (snapshot) => {
      setSnapshots((previous) => [...previous, snapshot]);
    },
  });
  return settleRun({ attempt, workload, setPhase });
}

interface SettleRunInput {
  readonly attempt: Promise<RunSimulationResult>;
  readonly workload: Workload;
  readonly setPhase: (phase: RunPhase) => void;
}

/** Waits for a run to end and records how it ended. */
function settleRun({
  attempt,
  workload,
  setPhase,
}: SettleRunInput): Promise<void> {
  return attempt.then(
    (result) => {
      setPhase(handleStatus(resultPhases(workload), result));
    },
    (error: unknown) => {
      setPhase({ status: "failed", workload, problem: String(error) });
    },
  );
}

/** The phase each result ends a run of `workload` in. */
function resultPhases(
  workload: Workload,
): StatusHandlers<RunSimulationResult, RunPhase> {
  return {
    finished: () => ({ status: "finished", workload }),
    stopped: () => ({ status: "stopped", workload }),
    // The picker offers only the project's workloads, so this means the
    // project changed under it.
    "workload-missing": () => ({
      status: "failed",
      workload,
      problem: "That workload is no longer in the project.",
    }),
  };
}
