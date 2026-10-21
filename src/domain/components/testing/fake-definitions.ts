import { z } from "zod";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import { distributionSchema } from "../../random/distribution";
import type { ComponentBehavior } from "../component-behavior";
import type {
  BuildContext,
  ComponentDefinition,
} from "../component-definition";
import { MessageQueueBehavior } from "./message-queue-behavior";
import { WorkerPoolBehavior } from "./worker-pool-behavior";

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
    return new WorkerPoolBehavior<T>({
      workers: new CountingSemaphore<T>({
        limit: config.workers,
        whenFull: "queue",
        queueCapacity: config.queueCapacity,
      }),
      waitLineCapacity: config.queueCapacity ?? Number.POSITIVE_INFINITY,
      serviceTime: new SampledServiceTime(config.serviceTime, random),
    });
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
    return new MessageQueueBehavior<T>(config);
  },
};
