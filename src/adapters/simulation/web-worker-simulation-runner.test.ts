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
import {
  UNREADABLE_REPLY,
  WebWorkerSimulationRunner,
  WORKER_FAILED,
} from "./web-worker-simulation-runner";

const registry = createAwsComponentRegistry();
const request = { project: sampleRecord.project, workloadId: "steady" };

type MessageListener = (event: WorkerReplyEvent) => void;
type ErrorListener = (event: WorkerErrorEvent) => void;
type MessageErrorListener = () => void;
type AnyListener = MessageListener | ErrorListener | MessageErrorListener;

interface WorkerListeners {
  readonly message: MessageListener[];
  readonly error: ErrorListener[];
  readonly messageerror: MessageErrorListener[];
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
  private readonly listeners: WorkerListeners = {
    message: [],
    error: [],
    messageerror: [],
  };

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
  addEventListener(type: "messageerror", listener: MessageErrorListener): void;
  addEventListener(type: keyof WorkerListeners, listener: AnyListener): void {
    // The overloads above pair each type with its own listener.
    (this.listeners[type] as AnyListener[]).push(listener);
  }

  /** Fires `error`; a script that fails to load sends one with no message. */
  fail(event: WorkerErrorEvent): void {
    this.listeners.error.forEach((listener) => {
      listener(event);
    });
  }

  /** Fires `messageerror`, as for a reply that can't be deserialized. */
  sendUnreadableReply(): void {
    this.listeners.messageerror.forEach((listener) => {
      listener();
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
    workers[0]?.fail({ message: "Failed to load the worker script" });

    await expect(promise).rejects.toThrow("Failed to load the worker script");
    expect(workers[0]?.terminated).toBe(true);
  });

  it("rejects with a fallback message when the Worker's error has none", async () => {
    vi.useFakeTimers();
    const { runner, workers } = setUp();

    const promise = runner.run({ request });
    workers[0]?.fail({});

    await expect(promise).rejects.toThrow(WORKER_FAILED);
  });

  it("rejects when a reply can't be read, terminating the Worker", async () => {
    vi.useFakeTimers();
    const { runner, workers } = setUp();

    const promise = runner.run({ request });
    workers[0]?.sendUnreadableReply();

    await expect(promise).rejects.toThrow(UNREADABLE_REPLY);
    expect(workers[0]?.terminated).toBe(true);
  });

  it("wraps a non-Error thrown by onSnapshot in an Error", async () => {
    const { runner } = setUp();

    const promise = runner.run({
      request,
      onSnapshot: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- the case under test
        throw "not an Error";
      },
    });

    // `rejects.toThrow` alone would also accept the bare string.
    await expect(promise).rejects.toBeInstanceOf(Error);
    await expect(promise).rejects.toThrow("not an Error");
  });
});
