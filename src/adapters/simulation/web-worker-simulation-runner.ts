import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type {
  SimulationOutcome,
  SimulationRunInput,
  SimulationRunner,
} from "../../application/ports/simulation-runner";
import type { StopSignal } from "../../application/ports/stop-signal";
import type {
  CreateSimulationWorker,
  SimulationWorker,
} from "./simulation-worker";
import type { WorkerReply } from "./simulation-worker-protocol";

export interface WebWorkerSimulationRunnerDependencies {
  /** Starts a fresh Worker for each run. */
  readonly createWorker: CreateSimulationWorker;
}

/**
 * The browser's `SimulationRunner`: each run gets its own Web Worker, so the
 * page stays responsive, and snapshots stream back as the Worker posts them.
 * Stopping terminates the Worker, which drops any replies still queued.
 */
export class WebWorkerSimulationRunner implements SimulationRunner {
  private readonly createWorker: CreateSimulationWorker;

  constructor({ createWorker }: WebWorkerSimulationRunnerDependencies) {
    this.createWorker = createWorker;
  }

  run({
    request,
    onSnapshot,
    stopSignal,
  }: SimulationRunInput): Promise<SimulationOutcome> {
    if (stopSignal?.aborted) return Promise.resolve({ status: "stopped" });
    const worker = this.createWorker();
    return new Promise((resolve, reject) => {
      watchRun({ worker, onSnapshot, stopSignal, resolve, reject });
      worker.postMessage({ kind: "run", request });
    });
  }
}

interface WatchRunInput {
  readonly worker: SimulationWorker;
  readonly onSnapshot: ((snapshot: MetricsSnapshot) => void) | undefined;
  readonly stopSignal: StopSignal | undefined;
  readonly resolve: (outcome: SimulationOutcome) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Settles the run on its first ending: the last reply, a Worker error, or
 * the stop signal. Whichever comes first terminates the Worker; anything
 * after it is ignored.
 */
function watchRun(input: WatchRunInput): void {
  const { worker, stopSignal } = input;
  let settled = false;
  const settle = (finish: () => void) => {
    if (settled) return;
    settled = true;
    stopSignal?.removeEventListener("abort", onStop);
    worker.terminate();
    finish();
  };
  const onStop = () => {
    settle(() => {
      input.resolve({ status: "stopped" });
    });
  };
  const handlers = replyHandlers({ ...input, settle });

  stopSignal?.addEventListener("abort", onStop);
  worker.addEventListener("message", ({ data }) => {
    if (!settled) handleKind(handlers, data);
  });
  worker.addEventListener("error", ({ message }) => {
    settle(() => {
      input.reject(new Error(message));
    });
  });
}

interface ReplyHandlersInput extends WatchRunInput {
  /** Ends the run once, then runs `finish`. */
  readonly settle: (finish: () => void) => void;
}

function replyHandlers({
  onSnapshot,
  settle,
  resolve,
  reject,
}: ReplyHandlersInput): KindHandlers<WorkerReply, void> {
  return {
    snapshot: ({ snapshot }) => {
      onSnapshot?.(snapshot);
    },
    finished: ({ run }) => {
      settle(() => {
        resolve({ status: "finished", run });
      });
    },
    failed: ({ message }) => {
      settle(() => {
        reject(new Error(message));
      });
    },
  };
}
