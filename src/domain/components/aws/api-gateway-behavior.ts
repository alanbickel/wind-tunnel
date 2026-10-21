import type { RateLimit } from "../../behaviors/rate-limit";
import type { ServiceTime } from "../../behaviors/service-time";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  LimitGauge,
  RefuseWhenFull,
} from "../component-behavior";
import { rateGauge } from "../limit-gauges";

/** Rejects a request that finds less than one token in the bucket. */
const THROTTLED: RefuseWhenFull = { kind: "refuse", reason: "throttled" };

export interface ApiGatewayBehaviorDependencies {
  readonly limit: RateLimit;
  /** API Gateway's own processing time per request. */
  readonly overhead: ServiceTime;
}

/** API Gateway's run-time state: its token bucket and requests in flight. */
export class ApiGatewayBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  readonly limits: readonly LimitGauge[];
  private readonly limit: RateLimit;
  private readonly overhead: ServiceTime;
  private running = 0;

  constructor({ limit, overhead }: ApiGatewayBehaviorDependencies) {
    this.limit = limit;
    this.overhead = overhead;
    this.limits = [
      rateGauge({ name: "requestRate", whenFull: THROTTLED, source: limit }),
    ];
  }

  get inProgress(): number {
    return this.running;
  }

  arrive({ request, nowMs }: ArriveInput<T>): Effect<T>[] {
    if (!this.limit.tryTake(nowMs)) {
      return [{ kind: "rejected", request, reason: THROTTLED.reason }];
    }
    this.running++;
    return [{ kind: "started", request, serviceMs: this.overhead.next() }];
  }

  finish(): Effect<T>[] {
    this.running--;
    return [];
  }
}
