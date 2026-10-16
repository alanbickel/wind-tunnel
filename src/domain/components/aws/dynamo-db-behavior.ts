import type { RateLimit } from "../../behaviors/rate-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";

export interface DynamoDbBehaviorDependencies {
  /** Read capacity; each read takes one unit. */
  readonly reads: RateLimit;
  /** Write capacity; each write takes one unit. */
  readonly writes: RateLimit;
  readonly latency: ServiceTime;
}

/** DynamoDB's run-time state: read and write capacity, and requests in flight. */
export class DynamoDbBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  private readonly reads: RateLimit;
  private readonly writes: RateLimit;
  private readonly latency: ServiceTime;
  private running = 0;

  constructor({ reads, writes, latency }: DynamoDbBehaviorDependencies) {
    this.reads = reads;
    this.writes = writes;
    this.latency = latency;
  }

  get inProgress(): number {
    return this.running;
  }

  arrive({ request, action, nowMs }: ArriveInput<T>): Effect<T>[] {
    const capacity = action === "write" ? this.writes : this.reads;
    if (!capacity.tryTake(nowMs)) {
      return [{ kind: "rejected", request, reason: "throttled" }];
    }
    this.running++;
    return [{ kind: "started", request, serviceMs: this.latency.next() }];
  }

  finish(): Effect<T>[] {
    this.running--;
    return [];
  }
}
