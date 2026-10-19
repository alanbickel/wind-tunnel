import { afterEach, describe, expect, it, vi } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { StopSignal } from "../../application/ports/stop-signal";
import { ManualStopSignal } from "../../application/testing/manual-stop-signal";
import { checkSimulationRunnerContract } from "../../application/testing/check-simulation-runner-contract";
import { sampleRecord } from "../../application/testing/sample-record";
import type {
  SimulationWorker,
  WorkerErrorEvent,
  WorkerReplyEvent,
} from "./simulation-worker";
import {
  serveRun,
  type RunMessage,
  type WorkerReply,
} from "./simulation-worker-protocol";
import { WebWorkerSimulationRunner } from "./web-worker-simulation-runner";

const registry = createAwsComponentRegistry();
const request = { project: sampleRecord.project, workloadId: "steady" };

type MessageListener = (event: WorkerReplyEvent) => void;
type ErrorListener = (event: WorkerErrorEvent) => void;

interface WorkerListeners {
  readonly message: MessageListener[];
  readonly error: ErrorListener[];
}

/**
 * Runs the real Worker script's `serveRun` on this thread, then delivers its
 * replies one per macrotask, as a Worker's message queue would, until it's
 * terminated.
 */
class FakeWorker implements SimulationWorker {
  terminated = false;
  /** False models replies that were already on their way when terminated. */
  dropsRepliesOnTerminate = true;
  private readonly listeners: WorkerListeners = { message: [], error: [] };

  postMessage(message: RunMessage): void {
    const replies: WorkerReply[] = [];
    serveRun({
      request: message.request,
      registry,
      post: (r) => replies.push(r),
    });
    this.deliver(replies);
  }

  terminate(): void {
    this.terminated = true;
  }

  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error", listener: ErrorListener): void;
  addEventListener(
    type: keyof WorkerListeners,
    listener: MessageListener | ErrorListener,
  ): void {
    // The overloads above pair each type with its own listener.
    (this.listeners[type] as (MessageListener | ErrorListener)[]).push(
      listener,
    );
  }

  /** Fires the Worker's `error` event, as a script that fails to load does. */
  fail(message: string): void {
    this.listeners.error.forEach((listener) => {
      listener({ message });
    });
  }

  private deliver(replies: WorkerReply[]): void {
    const next = () => {
      const reply = replies.shift();
      if (reply === undefined) return;
      if (this.terminated && this.dropsRepliesOnTerminate) return;
      this.listeners.message.forEach((listener) => {
        listener({ data: reply });
      });
      setTimeout(next, 0);
    };
    setTimeout(next, 0);
  }
}

function setUp() {
  const workers: FakeWorker[] = [];
  const runner = new WebWorkerSimulationRunner({
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { runner, workers };
}

describe("WebWorkerSimulationRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the SimulationRunner contract", async () => {
    const { runner } = setUp();

    expect(await checkSimulationRunnerContract(runner, request)).toEqual([]);
  });

  it("gives each run its own Worker and terminates it when the run finishes", async () => {
    const { runner, workers } = setUp();

    await runner.run({ request });
    await runner.run({ request });

    expect(workers.map((w) => w.terminated)).toEqual([true, true]);
  });

  it("doesn't start a Worker for a run stopped before it starts", async () => {
    const { runner, workers } = setUp();
    const controller = new AbortController();
    controller.abort();

    await runner.run({ request, stopSignal: controller.signal });

    expect(workers).toHaveLength(0);
  });

  it("stops on a DOM AbortSignal, terminating the Worker", async () => {
    const { runner, workers } = setUp();
    const controller = new AbortController();
    // The DOM's AbortSignal must fit the port's StopSignal as is.
    const stopSignal: StopSignal = controller.signal;
    let snapshots = 0;

    const outcome = await runner.run({
      request,
      stopSignal,
      onSnapshot: () => {
        snapshots += 1;
        if (snapshots === 2) controller.abort();
      },
    });

    expect(outcome).toEqual({ status: "stopped" });
    expect(snapshots).toBe(2);
    expect(workers[0]?.terminated).toBe(true);
  });

  it("ignores replies that still arrive after the stop", async () => {
    const workers: FakeWorker[] = [];
    const runner = new WebWorkerSimulationRunner({
      createWorker: () => {
        const worker = new FakeWorker();
        worker.dropsRepliesOnTerminate = false;
        workers.push(worker);
        return worker;
      },
    });
    const stopSignal = new ManualStopSignal();
    let snapshots = 0;

    await runner.run({
      request,
      stopSignal,
      onSnapshot: () => {
        snapshots += 1;
        stopSignal.stop();
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(snapshots).toBe(1);
  });

  it("stops listening to the stop signal once the run ends", async () => {
    const { runner } = setUp();
    const stopSignal = new ManualStopSignal();

    await runner.run({ request, stopSignal });

    expect(stopSignal.listenerCount).toBe(0);
  });

  it("rejects with the message of a Worker error, terminating the Worker", async () => {
    vi.useFakeTimers();
    const { runner, workers } = setUp();

    const promise = runner.run({ request });
    workers[0]?.fail("Failed to load the worker script");

    await expect(promise).rejects.toThrow("Failed to load the worker script");
    expect(workers[0]?.terminated).toBe(true);
  });
});
