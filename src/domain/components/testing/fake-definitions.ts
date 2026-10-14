import { z } from "zod";
import { ConcurrencyLimit } from "../../behaviors/concurrency-limit";
import { Queue } from "../../behaviors/queue";
import { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior, Effect } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";

// Small, correct definitions for tests of the registry, validation, and the
// contract checker. They also serve as reference implementations of
// `ComponentBehavior`: one ordinary component and one queue-like one.

const workerPoolConfig = z.object({
  workers: z.number().int().min(1),
  /** Waiters allowed when all workers are busy; unbounded if omitted. */
  queueCapacity: z.number().int().min(0).optional(),
  serviceTime: distributionSchema,
});
type WorkerPoolConfig = z.infer<typeof workerPoolConfig>;

/** N workers with a wait line in front: ConcurrencyLimit (queue) → ServiceTime. */
export const workerPoolDefinition: ComponentDefinition<WorkerPoolConfig> = {
  type: "test-worker-pool",
  displayName: "Test worker pool",
  configSchema: workerPoolConfig,
  defaultConfig: {
    workers: 4,
    queueCapacity: 8,
    serviceTime: { kind: "exponential", meanMs: 10 },
  },
  actions: ["invoke", "read"],
  deliversAsync: false,
  build<T>(
    config: WorkerPoolConfig,
    { random }: BuildContext,
  ): ComponentBehavior<T> {
    const workers = new ConcurrencyLimit<T>({
      limit: config.workers,
      whenFull: "queue",
      queueCapacity: config.queueCapacity,
    });
    const serviceTime = new ServiceTime(config.serviceTime, random);
    const start = (request: T): Effect<T> => ({
      kind: "started",
      request,
      serviceMs: serviceTime.next(),
    });
    return {
      arrive(request) {
        switch (workers.acquire(request)) {
          case "admitted":
            return [start(request)];
          case "queued":
            return [{ kind: "queued", request }];
          case "rejected":
            return [{ kind: "rejected", request, reason: "queue-full" }];
        }
      },
      finish() {
        const next = workers.release();
        return next === undefined ? [] : [start(next)];
      },
      get inProgress() {
        return workers.inUse;
      },
      get queueDepth() {
        return workers.queued;
      },
    };
  },
};

const messageQueueConfig = z.object({
  /** Consumers working at once: async deliveries in flight. */
  consumers: z.number().int().min(1),
  sendMs: z.number().nonnegative(),
});
type MessageQueueConfig = z.infer<typeof messageQueueConfig>;

/**
 * Accepts `enqueue`, buffers messages, and dispatches their async work to at
 * most `consumers` at once. Failed deliveries go to the back of the queue.
 */
export const messageQueueDefinition: ComponentDefinition<MessageQueueConfig> = {
  type: "test-message-queue",
  displayName: "Test message queue",
  configSchema: messageQueueConfig,
  defaultConfig: { consumers: 2, sendMs: 1 },
  actions: ["enqueue"],
  deliversAsync: true,
  build<T>(config: MessageQueueConfig): ComponentBehavior<T> {
    const backlog = new Queue<T>();
    let sending = 0;
    let inFlight = 0;
    const deliver = (): Effect<T>[] => {
      const effects: Effect<T>[] = [];
      while (inFlight < config.consumers) {
        const request = backlog.poll();
        if (request === undefined) break;
        inFlight++;
        effects.push({ kind: "dispatched", request });
      }
      return effects;
    };
    return {
      arrive(request) {
        sending++;
        return [{ kind: "started", request, serviceMs: config.sendMs }];
      },
      finish(request) {
        sending--;
        backlog.offer(request);
        return deliver();
      },
      dispatchFinished(request, succeeded) {
        inFlight--;
        if (!succeeded) backlog.offer(request);
        return deliver();
      },
      get inProgress() {
        return sending;
      },
      get queueDepth() {
        return backlog.size;
      },
    };
  },
};
