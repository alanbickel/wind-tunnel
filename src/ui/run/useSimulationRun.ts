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

/**
 * What a run that has started ran: the project as it was when it started,
 * and the workload. Everything shown about the run reads this copy, not
 * the project as it is now (ADR-0018). A project is never changed in
 * place, so keeping the one the run started with keeps a copy.
 */
export interface RanModel {
  readonly project: Project;
  readonly workload: Workload;
}

export interface RunRunning extends RanModel {
  readonly status: "running";
}

export interface RunFinished extends RanModel {
  readonly status: "finished";
}

/** The user stopped the run; its snapshots so far stay. */
export interface RunStopped extends RanModel {
  readonly status: "stopped";
}

export interface RunFailed extends RanModel {
  readonly status: "failed";
  /** Why, for the user. */
  readonly problem: string;
}

/** The latest run's snapshots, and which run they're from. */
export interface RunReceived {
  /** Counts the runs started, so one run's snapshots aren't taken for the next's. */
  readonly runId: number;
  /** The latest run's snapshots, in order; they grow while it runs. */
  readonly snapshots: readonly MetricsSnapshot[];
}

/** Before the first run. */
const NOTHING_RECEIVED: RunReceived = { runId: 0, snapshots: [] };

export interface SimulationRun extends RunReceived {
  readonly phase: RunPhase;
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
  const [received, setReceived] = useState(NOTHING_RECEIVED);
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
      const context = { runSimulation, project, setPhase, setReceived };
      void runWorkload({ workload, controller }, context).finally(() => {
        going.current = undefined;
      });
    },
    [project, runSimulation],
  );

  const stop = useCallback(() => {
    going.current?.abort();
  }, []);

  return { phase, ...received, start, stop };
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
  readonly setReceived: Dispatch<SetStateAction<RunReceived>>;
}

/**
 * Starts a run afresh, collects its snapshots, and records how it ended.
 * The run keeps the project it started with, whatever happens to the
 * project while it runs.
 */
function runWorkload(
  { workload, controller }: RunWorkloadInput,
  { runSimulation, project, setPhase, setReceived }: RunWorkloadContext,
): Promise<void> {
  const ran: RanModel = { project, workload };
  setPhase({ status: "running", ...ran });
  setReceived(({ runId }) => ({ runId: runId + 1, snapshots: [] }));
  const attempt = runSimulation.execute({
    project,
    workloadId: workload.id,
    stopSignal: controller.signal,
    onSnapshot: (snapshot) => {
      setReceived(({ runId, snapshots }) => ({
        runId,
        snapshots: [...snapshots, snapshot],
      }));
    },
  });
  return settleRun({ attempt, ran, setPhase });
}

interface SettleRunInput {
  readonly attempt: Promise<RunSimulationResult>;
  readonly ran: RanModel;
  readonly setPhase: (phase: RunPhase) => void;
}

/** Waits for a run to end and records how it ended. */
function settleRun({ attempt, ran, setPhase }: SettleRunInput): Promise<void> {
  return attempt.then(
    (result) => {
      setPhase(handleStatus(resultPhases(ran), result));
    },
    (error: unknown) => {
      setPhase({ status: "failed", ...ran, problem: String(error) });
    },
  );
}

/** The phase each result ends a run of `ran` in. */
function resultPhases(
  ran: RanModel,
): StatusHandlers<RunSimulationResult, RunPhase> {
  return {
    finished: () => ({ status: "finished", ...ran }),
    stopped: () => ({ status: "stopped", ...ran }),
    // The picker offers only the project's workloads, so this means the
    // project changed under it.
    "workload-missing": () => ({
      status: "failed",
      ...ran,
      problem: "That workload is no longer in the project.",
    }),
  };
}
