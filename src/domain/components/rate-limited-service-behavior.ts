import type { RateLimit } from "../behaviors/rate-limit";
import type { ServiceTime } from "../behaviors/service-time";
import type { StepAction } from "../model/project";
import type {
  ArriveInput,
  ComponentBehavior,
  Effect,
  LimitGauge,
  RefuseWhenFull,
  RequestSettings,
} from "./component-behavior";
import { rateGauge } from "./limit-gauges";

/**
 * A request's cost in tokens from its step's request settings for the
 * action: any positive number, at most the bucket's burst.
 */
export type RequestCost = (settings: RequestSettings) => number;

/** What one action draws on: the bucket it takes its cost from, and its time. */
export interface RateLimitedAction {
  /** The bucket each request takes its cost from; may be shared with other actions. */
  readonly limit: RateLimit;
  /** How many tokens a request takes, from its settings. */
  readonly cost: RequestCost;
  /** How long a request that gets in takes; may be shared too. */
  readonly serviceTime: ServiceTime;
}

/** A bucket, and the name it reports as a limit, e.g. `readUnits`. */
export interface NamedRateLimit {
  /** camelCase, unique within the component. */
  readonly name: string;
  readonly source: RateLimit;
}

export interface RateLimitedServiceBehaviorDependencies {
  /** What each accepted action draws on. */
  readonly actions: Readonly<Partial<Record<StepAction, RateLimitedAction>>>;
  /** Every bucket the actions use, reported as limits in this order. */
  readonly limits: readonly NamedRateLimit[];
  /** How each bucket refuses once empty, e.g. `throttled`. */
  readonly whenFull: RefuseWhenFull;
}

/**
 * The run-time state of a rate-limited request/response service, such as
 * DynamoDB or API Gateway: a request takes its cost in tokens from its
 * action's bucket, or is refused when the bucket holds less, and otherwise
 * is served for its action's service time. Nothing waits inside it.
 */
export class RateLimitedServiceBehavior<T> implements ComponentBehavior<T> {
  readonly queueDepth = 0;
  readonly limits: readonly LimitGauge[];
  private readonly actions: RateLimitedServiceBehaviorDependencies["actions"];
  private readonly whenFull: RefuseWhenFull;
  private running = 0;

  constructor({
    actions,
    limits,
    whenFull,
  }: RateLimitedServiceBehaviorDependencies) {
    this.actions = actions;
    this.whenFull = whenFull;
    this.limits = limits.map(({ name, source }) =>
      rateGauge({ name, whenFull, source }),
    );
  }

  get inProgress(): number {
    return this.running;
  }

  arrive({ request, action, settings, nowMs }: ArriveInput<T>): Effect<T>[] {
    const { limit, cost, serviceTime } = this.actionOf(action);
    if (!limit.tryTake({ nowMs, cost: cost(settings) })) {
      return [{ kind: "rejected", request, reason: this.whenFull.reason }];
    }
    this.running++;
    return [{ kind: "started", request, serviceMs: serviceTime.next() }];
  }

  finish(): Effect<T>[] {
    this.running--;
    return [];
  }

  /** Throws for an action the type doesn't accept, which validation rules out. */
  private actionOf(action: StepAction): RateLimitedAction {
    const found = this.actions[action];
    if (found === undefined) throw new Error(`No action "${action}"`);
    return found;
  }
}
