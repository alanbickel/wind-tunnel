import type { RunMessage, WorkerReply } from "./simulation-worker-protocol";

/** A message from the Worker, as its `message` event carries it. */
export interface WorkerReplyEvent {
  readonly data: WorkerReply;
}

/** The Worker failed to load or threw outside a run, as its `error` event says. */
export interface WorkerErrorEvent {
  readonly message: string;
}

/**
 * The part of a DOM `Worker` that `WebWorkerSimulationRunner` uses, so a
 * real Worker fits it and a test can pass a fake.
 */
export interface SimulationWorker {
  postMessage(message: RunMessage): void;
  /** Stops the Worker at once; queued replies are dropped. */
  terminate(): void;
  addEventListener(
    type: "message",
    listener: (event: WorkerReplyEvent) => void,
  ): void;
  addEventListener(
    type: "error",
    listener: (event: WorkerErrorEvent) => void,
  ): void;
}

/** Starts a new Worker running `simulation-worker-entry.ts`. */
export type CreateSimulationWorker = () => SimulationWorker;
