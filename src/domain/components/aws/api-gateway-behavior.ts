import type { RateLimit } from "../../behaviors/rate-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
} from "../component-behavior";

export interface ApiGatewayBehaviorDependencies {
  readonly limit: RateLimit;
  /** API Gateway's own processing time per request. */
  readonly overhead: ServiceTime;
}

/** API Gateway's run-time state: its token bucket and requests in flight. */
export class ApiGatewayBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  private readonly limit: RateLimit;
  private readonly overhead: ServiceTime;
  private running = 0;

  constructor({ limit, overhead }: ApiGatewayBehaviorDependencies) {
    this.limit = limit;
    this.overhead = overhead;
  }

  get inProgress(): number {
    return this.running;
  }

  arrive({ request, nowMs }: ArriveInput<T>): Effect<T>[] {
    if (!this.limit.tryTake(nowMs)) {
      return [{ kind: "rejected", request, reason: "throttled" }];
    }
    this.running++;
    return [{ kind: "started", request, serviceMs: this.overhead.next() }];
  }

  finish(): Effect<T>[] {
    this.running--;
    return [];
  }
}
