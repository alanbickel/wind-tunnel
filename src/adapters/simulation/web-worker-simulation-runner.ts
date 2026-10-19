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
  WorkerErrorEvent,
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
  readonly reject: (error: unknown) => void;
}

/** When the Worker's script fails to load, its `error` event has no message. */
export const WORKER_FAILED =
  "The simulation Worker failed to start or stopped unexpectedly.";

/** A reply the page couldn't decode; the run can't go on without it. */
export const UNREADABLE_REPLY =
  "A message from the simulation Worker couldn't be read.";

function workerErrorMessage({ message }: WorkerErrorEvent): string {
  return message === undefined || message === "" ? WORKER_FAILED : message;
}

/** Rejections carry an `Error`, even if `onSnapshot` threw something else. */
function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Settles the run on its first ending: the last reply, a Worker failure,
 * a throwing `onSnapshot`, or the stop signal. Whichever comes first
 * terminates the Worker; anything after it is ignored.
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
  watchFailures({ ...input, settle });
}

/** Rejects the run if the Worker fails or sends a reply that can't be read. */
function watchFailures({ worker, settle, reject }: ReplyHandlersInput): void {
  worker.addEventListener("error", (event) => {
    settle(() => {
      reject(new Error(workerErrorMessage(event)));
    });
  });
  worker.addEventListener("messageerror", () => {
    settle(() => {
      reject(new Error(UNREADABLE_REPLY));
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
      // A throw here would escape the message listener and the run would
      // carry on; end it instead, as the in-process runner does.
      try {
        onSnapshot?.(snapshot);
      } catch (error) {
        settle(() => {
          reject(asError(error));
        });
      }
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
