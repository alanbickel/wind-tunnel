import { Queue } from "../../behaviors/queue";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  DispatchFinishedInput,
  Effect,
  FinishInput,
  LimitGauge,
  WaitWhenFull,
} from "../component-behavior";
import { concurrencyGauge } from "../limit-gauges";

/** A message waits in the backlog for a consumer, holding nothing. */
const WAIT_IN_BACKLOG: WaitWhenFull = { kind: "wait", holds: undefined };

export interface SqsBehaviorDependencies {
  /** Time for `SendMessage` to return to the sender. */
  readonly sendLatency: ServiceTime;
  /** Deliveries in flight at once. */
  readonly consumerMaxConcurrency: number;
}

/** Deliveries in flight, and the most allowed at once. */
interface ConsumerSlots {
  readonly limit: number;
  inUse: number;
}

/** SQS's run-time state: messages being sent, the backlog, and deliveries. */
export class SqsBehavior<T> implements ComponentBehavior<T> {
  readonly limits: readonly LimitGauge[];
  private readonly backlog = new Queue<T>();
  private readonly sendLatency: ServiceTime;
  private readonly consumers: ConsumerSlots;
  private sending = 0;

  constructor({
    sendLatency,
    consumerMaxConcurrency,
  }: SqsBehaviorDependencies) {
    this.sendLatency = sendLatency;
    this.consumers = { limit: consumerMaxConcurrency, inUse: 0 };
    this.limits = [
      concurrencyGauge({
        name: "consumerConcurrency",
        whenFull: WAIT_IN_BACKLOG,
        source: this.consumers,
      }),
    ];
  }

  get inProgress(): number {
    return this.sending;
  }

  get queueDepth(): number {
    return this.backlog.size;
  }

  arrive({ request }: ArriveInput<T>): Effect<T>[] {
    this.sending++;
    return [{ kind: "started", request, serviceMs: this.sendLatency.next() }];
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
    this.consumers.inUse--;
    if (!succeeded) this.backlog.offer(request);
    return this.deliver();
  }

  /** Dispatches waiting messages to every free consumer slot. */
  private deliver(): Effect<T>[] {
    const effects: Effect<T>[] = [];
    while (this.consumers.inUse < this.consumers.limit) {
      const request = this.backlog.poll();
      if (request === undefined) break;
      this.consumers.inUse++;
      effects.push({ kind: "dispatched", request });
    }
    return effects;
  }
}
