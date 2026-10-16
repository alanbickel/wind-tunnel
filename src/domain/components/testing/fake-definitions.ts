/* eslint-disable max-classes-per-file -- each behavior moves to its own file in R2.8 */
import { z } from "zod";
import type {
  AcquireResult,
  ConcurrencyLimit,
} from "../../behaviors/concurrency-limit";
import { CountingSemaphore } from "../../behaviors/counting-semaphore";
import { Queue } from "../../behaviors/queue";
import { SampledServiceTime } from "../../behaviors/sampled-service-time";
import type { ServiceTime } from "../../behaviors/service-time";
import { distributionSchema } from "../../random/distribution";
import { lookup } from "../../shared/kind-handlers";
import type {
  ArriveInput,
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
  FinishInput,
} from "../component-behavior";
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
    context: BuildContext,
  ): ComponentBehavior<T> {
    return new WorkerPoolBehavior<T>(config, context);
  },
};

class WorkerPoolBehavior<T> implements ComponentBehavior<T> {
  private readonly workers: ConcurrencyLimit<T>;
  private readonly serviceTime: ServiceTime;

  /** What an arrival gets, by what the worker limit said. */
  private readonly outcomes: Readonly<
    Record<AcquireResult, (request: T) => Effect<T>>
  > = {
    admitted: (request) => this.start(request),
    queued: (request) => ({ kind: "queued", request }),
    rejected: (request) => ({
      kind: "rejected",
      request,
      reason: "queue-full",
    }),
  };

  constructor(config: WorkerPoolConfig, { random }: BuildContext) {
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.workers = new CountingSemaphore<T>({
      limit: config.workers,
      whenFull: "queue",
      queueCapacity: config.queueCapacity,
    });
    // eslint-disable-next-line no-restricted-syntax -- moves to a factory in R2.8 (ADR-0009)
    this.serviceTime = new SampledServiceTime(config.serviceTime, random);
  }

  get inProgress(): number {
    return this.workers.inUse;
  }

  get queueDepth(): number {
    return this.workers.queued;
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    const outcome = lookup(this.outcomes, this.workers.acquire(request));
    return [outcome(request)];
  }

  finish(): Effect<T>[] {
    const next = this.workers.release();
    if (next === undefined) return [];
    return [this.start(next)];
  }

  private start(request: T): Effect<T> {
    return { kind: "started", request, serviceMs: this.serviceTime.next() };
  }
}

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

class MessageQueueBehavior<T> implements ComponentBehavior<T> {
  private readonly backlog = new Queue<T>();
  private readonly config: MessageQueueConfig;
  private sending = 0;
  private inFlight = 0;

  constructor(config: MessageQueueConfig) {
    this.config = config;
  }

  get inProgress(): number {
    return this.sending;
  }

  get queueDepth(): number {
    return this.backlog.size;
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    this.sending++;
    return [{ kind: "started", request, serviceMs: this.config.sendMs }];
  }

  finish({ request }: FinishInput<T>): Effect<T>[] {
    this.sending--;
    this.backlog.offer(request);
    return this.deliver();
  }

  dispatchFinished({
    request,
    succeeded,
  }: DispatchFinishedInput<T>): Effect<T>[] {
    this.inFlight--;
    if (!succeeded) this.backlog.offer(request);
    return this.deliver();
  }

  private deliver(): Effect<T>[] {
    const effects: Effect<T>[] = [];
    while (this.inFlight < this.config.consumers) {
      const request = this.backlog.poll();
      if (request === undefined) break;
      this.inFlight++;
      effects.push({ kind: "dispatched", request });
    }
    return effects;
  }
}
