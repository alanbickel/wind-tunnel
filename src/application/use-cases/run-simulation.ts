import type {
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import type { Project, Workload } from "../../domain/model/project";
import type {
  SimulationOutcome,
  SimulationRunner,
} from "../ports/simulation-runner";
import type { StopSignal } from "../ports/stop-signal";

export interface RunSimulationDependencies {
  readonly runner: SimulationRunner;
}

export interface RunSimulationInput {
  /** A project that passed validation, e.g. from `OpenProject`. */
  readonly project: Project;
  /** Defaults to the project's first workload. */
  readonly workloadId?: string;
  /** Replaces the workload's seed for this run only; nothing is saved. */
  readonly seed?: number;
  /** Gets each per-second snapshot as the run produces it. */
  readonly onSnapshot?: (snapshot: MetricsSnapshot) => void;
  /**
   * Stops the run when it fires; the result is then `stopped`. In the
   * browser, pass `new AbortController().signal`.
   */
  readonly stopSignal?: StopSignal;
}

export type RunSimulationResult = RunFinished | RunStopped | WorkloadMissing;

/** The workload to run, and the project it runs in. */
export interface RunTarget {
  readonly project: Project;
  readonly workload: Workload;
}

export interface RunFinished extends RunTarget {
  readonly status: "finished";
  readonly run: MetricsRun;
}

/** The stop signal fired before the run finished. */
export interface RunStopped extends RunTarget {
  readonly status: "stopped";
}

export interface WorkloadMissing {
  readonly status: "workload-missing";
  /** The ID asked for; absent if none was given and the project has none. */
  readonly workloadId?: string;
}

/**
 * Runs one of a project's workloads, optionally with another seed. The
 * result's `project` and `workload` are as they ran, with the seed applied.
 */
export class RunSimulation {
  private readonly runner: SimulationRunner;

  constructor({ runner }: RunSimulationDependencies) {
    this.runner = runner;
  }

  async execute(input: RunSimulationInput): Promise<RunSimulationResult> {
    const target = selectWorkload(input);
    if (target === undefined) return workloadMissing(input);
    const outcome = await this.runner.run({
      request: { project: target.project, workloadId: target.workload.id },
      onSnapshot: input.onSnapshot,
      stopSignal: input.stopSignal,
    });
    return resultOf(outcome, target);
  }
}

/** The use case's result for what the runner reported. */
function resultOf(
  outcome: SimulationOutcome,
  target: RunTarget,
): RunFinished | RunStopped {
  if (outcome.status === "stopped") return { status: "stopped", ...target };
  return { status: "finished", ...target, run: outcome.run };
}

/** The workload the input asks for, with its seed applied; undefined if none. */
function selectWorkload(input: RunSimulationInput): RunTarget | undefined {
  const { project, seed } = input;
  const workloadId = input.workloadId ?? project.workloads[0]?.id;
  const workload = project.workloads.find((w) => w.id === workloadId);
  if (workload === undefined) return undefined;
  if (seed === undefined) return { project, workload };
  return withSeed({ project, workload }, seed);
}

/** The target with its workload's seed replaced, in the project too. */
function withSeed(target: RunTarget, seed: number): RunTarget {
  const workload = { ...target.workload, seed };
  const workloads = target.project.workloads.map((w) =>
    w.id === workload.id ? workload : w,
  );
  return { project: { ...target.project, workloads }, workload };
}

function workloadMissing({ workloadId }: RunSimulationInput): WorkloadMissing {
  const missing = { status: "workload-missing" } as const;
  return workloadId === undefined ? missing : { ...missing, workloadId };
}
