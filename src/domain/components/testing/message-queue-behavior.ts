import { Queue } from "../../behaviors/queue";
import type {
  ArriveInput,
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
  FinishInput,
} from "../component-behavior";

export interface MessageQueueBehaviorInput {
  /** Consumers working at once: async deliveries in flight. */
  readonly consumers: number;
  readonly sendMs: number;
}

/**
 * Buffers messages and dispatches their async work to at most `consumers`
 * at once. Failed deliveries go to the back of the queue.
 */
export class MessageQueueBehavior<T> implements ComponentBehavior<T> {
  private readonly backlog = new Queue<T>();
  private readonly config: MessageQueueBehaviorInput;
  private sending = 0;
  private inFlight = 0;

  constructor(config: MessageQueueBehaviorInput) {
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
