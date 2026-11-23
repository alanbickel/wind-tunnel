import type { z } from "zod";
import type { RateLimit } from "../behaviors/rate-limit";
import { SampledServiceTime } from "../behaviors/sampled-service-time";
import { TokenBucket, type TokenBucketInput } from "../behaviors/token-bucket";
import type { EdgeSettings } from "../model/edge-settings";
import type { StepAction } from "../model/project";
import type { Distribution } from "../random/distribution";
import type { RandomSource } from "../random/random-source";
import type { ComponentBehavior, RefuseWhenFull } from "./component-behavior";
import type { BuildContext, ComponentDefinition } from "./component-definition";
import {
  RateLimitedServiceBehavior,
  type RateLimitedAction,
  type RateLimitedServiceBehaviorDependencies,
  type RequestCost,
} from "./rate-limited-service-behavior";

/** A config field that holds a distribution, such as `latency`. */
export type DistributionKey<Config> = {
  [K in keyof Config]: Config[K] extends Distribution ? K : never;
}[keyof Config];

/** A limit's bucket size from the config. The type decides its burst. */
export type BucketOf<Config> = (config: Config) => TokenBucketInput;

/** What one action draws on, by name: a limit, and a config field's time. */
export interface RateLimitedActionSpec<Config, Limit extends string> {
  /** The limit it takes its cost from; two actions may name the same one. */
  readonly limit: Limit;
  /**
   * Tokens a request takes, from its step's request settings; 1 if left
   * out. The limit's burst must hold the largest cost it returns.
   */
  readonly cost?: RequestCost;
  /** The setting its service time comes from; two actions may share one. */
  readonly serviceTime: DistributionKey<Config>;
}

/**
 * A rate-limited request/response type as configuration: its settings, its
 * limits, and what each action draws on. `rateLimitedServiceDefinition`
 * turns it into a definition.
 */
export interface RateLimitedServiceSpec<
  Config,
  Limit extends string,
  Action extends StepAction,
> {
  readonly type: string;
  readonly displayName: string;
  readonly configSchema: z.ZodType<Config>;
  readonly defaultConfig: Config;
  readonly edgeDefaults: EdgeSettings;
  /** How every limit refuses once empty: the type's one rejection reason. */
  readonly refusal: RefuseWhenFull;
  /** Each limit's bucket, by the name it reports, in the order reported. */
  readonly limits: Readonly<Record<Limit, BucketOf<Config>>>;
  /** Each accepted action and what it draws on, in the order listed. */
  readonly actions: Readonly<
    Record<Action, RateLimitedActionSpec<Config, Limit>>
  >;
}

/**
 * A definition for a rate-limited request/response service: each request
 * takes its action's cost in tokens from its limit's bucket, is refused when
 * the bucket holds less, and is otherwise served for a sampled time. Nothing queues, and it never
 * delivers async work. DynamoDB, API Gateway, and S3 are built on it.
 */
export function rateLimitedServiceDefinition<
  Config,
  Limit extends string,
  Action extends StepAction,
>(
  spec: RateLimitedServiceSpec<Config, Limit, Action>,
): ComponentDefinition<Config> {
  const { type, displayName, configSchema, defaultConfig, edgeDefaults } = spec;
  return {
    type,
    displayName,
    configSchema,
    defaultConfig,
    edgeDefaults,
    actions: Object.keys(spec.actions) as Action[],
    deliversAsync: false,
    rejectionReasons: [spec.refusal.reason],
    build<T>(config: Config, { random }: BuildContext): ComponentBehavior<T> {
      return new RateLimitedServiceBehavior<T>(
        dependenciesOf({ spec, config, random }),
      );
    },
  };
}

interface DependenciesOfInput<
  Config,
  Limit extends string,
  Action extends StepAction,
> {
  readonly spec: RateLimitedServiceSpec<Config, Limit, Action>;
  readonly config: Config;
  readonly random: RandomSource;
}

/** One bucket per limit, and each action wired to its bucket and time. */
function dependenciesOf<
  Config,
  Limit extends string,
  Action extends StepAction,
>(
  input: DependenciesOfInput<Config, Limit, Action>,
): RateLimitedServiceBehaviorDependencies {
  const { spec, config } = input;
  const buckets = mapValues(
    spec.limits,
    (bucketOf): RateLimit => new TokenBucket(bucketOf(config)),
  );
  const limits = Object.entries<RateLimit>(buckets).map(([name, source]) => ({
    name,
    source,
  }));
  return {
    actions: actionsOf(input, buckets),
    limits,
    whenFull: spec.refusal,
  };
}

/** One token, whatever the request: the cost of an action that names none. */
const ONE_TOKEN: RequestCost = () => 1;

/**
 * Each action with its limit's bucket, its cost, and a time sampled from
 * its setting.
 */
function actionsOf<Config, Limit extends string, Action extends StepAction>(
  { spec, config, random }: DependenciesOfInput<Config, Limit, Action>,
  buckets: Readonly<Record<Limit, RateLimit>>,
): Record<Action, RateLimitedAction> {
  // Separate SampledServiceTimes on one setting draw the same sequence as a
  // shared one would: the only state they hold is the run's random source.
  return mapValues(spec.actions, ({ limit, cost, serviceTime }) => ({
    limit: buckets[limit],
    cost: cost ?? ONE_TOKEN,
    serviceTime: new SampledServiceTime(
      config[serviceTime] as Distribution,
      random,
    ),
  }));
}

/** `record` with each value replaced by `map(value)`, keys in order. */
function mapValues<Key extends string, Value, Mapped>(
  record: Readonly<Record<Key, Value>>,
  map: (value: Value) => Mapped,
): Record<Key, Mapped> {
  const entries = Object.entries<Value>(record);
  return Object.fromEntries(
    entries.map(([key, value]) => [key, map(value)]),
  ) as Record<Key, Mapped>;
}
