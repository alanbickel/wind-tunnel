import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../components/aws";
import type { ComponentRegistry } from "../components/component-registry";
import { ComponentRegistryMap } from "../components/component-registry-map";
import { refuserDefinition } from "../components/testing/fake-definitions";
import type {
  Component,
  Edge,
  EdgeRetry,
  Project,
  Step,
} from "../model/project";
import { deriveSeed, type RandomSource } from "../random/random-source";
import { SeededRandom } from "../random/seeded-random";
import { simulate } from "./create-simulation";
import type { SimulationEvent } from "./simulation-events";

// An edge with the AWS SDK standard preset waits by the failure's kind
// (ADR-0025 decisions 2.3 and 3). The retries stream always draws 0.5, so
// full jitter waits exactly half the exponential value: the first retry
// waits half the base delay, the second the base delay itself.

const constant = (valueMs: number) => ({ kind: "constant", valueMs });

/** Every target a test calls, each set up to fail every attempt. */
const components: readonly Component[] = [
  {
    id: "fn",
    type: "lambda",
    name: "Function",
    config: {
      concurrency: 1_000,
      coldStart: constant(0),
      idleTimeoutSec: 600,
      computeTime: constant(1),
    },
  },
  // Throttles: refuses every request as "busy".
  {
    id: "refuser",
    type: "test-refuser",
    name: "Refuser",
    config: { reason: "busy" },
  },
  // Transient: answers after the edge's 10 ms timeout.
  {
    id: "db",
    type: "rds",
    name: "Database",
    config: {
      maxConnections: 1_000,
      queryWorkers: 1_000,
      queryTime: constant(500),
    },
  },
  // Transient, as db, but DynamoDB's clients wait from 25 ms.
  {
    id: "slow-table",
    type: "dynamodb",
    name: "Slow table",
    config: {
      readUnitsPerSec: 10_000,
      writeUnitsPerSec: 10_000,
      burstSec: 1,
      latency: constant(500),
    },
  },
  // Throttles: room for one read of the largest item, refilled far too
  // slowly for the next.
  {
    id: "tiny-table",
    type: "dynamodb",
    name: "Tiny table",
    config: {
      readUnitsPerSec: 0.001,
      writeUnitsPerSec: 0.001,
      burstSec: 0,
      latency: constant(1),
    },
  },
];

function registry(): ComponentRegistry {
  const aws = createAwsComponentRegistry();
  const test = new ComponentRegistryMap().register(refuserDefinition);
  return {
    get: (type) => aws.get(type) ?? test.get(type),
    list: () => [...aws.list(), ...test.list()],
  };
}

/** Seeded streams, but every retry's jitter draws 0.5. */
function halfJitter(stream: string): RandomSource {
  if (stream === "retries") return { next: () => 0.5 };
  return new SeededRandom(deriveSeed(7, stream));
}

/** One call from fn to `target`, along an edge with these retries. */
function project(target: string, retry: EdgeRetry): Project {
  // DynamoDB's largest read, 100 units, which a DynamoDB bucket always holds.
  const settings = target.endsWith("table")
    ? { itemSizeKb: 400, consistency: "strong" }
    : undefined;
  const root: Step = {
    id: "fn-invoke",
    componentId: "fn",
    action: "invoke",
    calls: [{ id: "call", componentId: target, action: "read", settings }],
  };
  const edge: Edge = {
    id: "fn->target",
    from: "fn",
    to: target,
    latencyMs: 1,
    timeoutMs: 10,
    retry,
  };
  return {
    id: "p",
    name: "Test",
    architecture: { components: [...components], edges: [edge] },
    workflows: [{ id: "main", name: "Main", root }],
    workloads: [
      {
        id: "load",
        name: "Load",
        durationMs: 2_000,
        seed: 7,
        mix: [{ workflowId: "main", weight: 1 }],
        profile: [{ atMs: 0, requestsPerSec: 5 }],
      },
    ],
  };
}

/** How long request `requestId` waited before each retry, in order. */
function waitsBeforeRetries(
  target: string,
  retry: EdgeRetry,
  requestId = 1,
): number[] {
  const events: SimulationEvent[] = [];
  simulate({
    project: project(target, retry),
    registry: registry(),
    workloadId: "load",
    untilMs: 60_000,
    random: halfJitter,
    observer: (e) => events.push(e),
  });
  return events.flatMap((e) =>
    e.kind === "edge-attempt-failed" && e.requestId === requestId
      ? [e.retryAtMs === undefined ? Number.NaN : e.retryAtMs - e.timeMs]
      : [],
  );
}

/** The wait before each retry, then NaN for the last failure, which has none. */
const waits = (...retries: number[]) => [...retries, Number.NaN];

const preset: EdgeRetry = { preset: "aws-sdk-standard" };

describe("the AWS SDK standard preset on an edge", () => {
  // Fails if the preset waits from one base delay for every kind, or from
  // the transient 50 ms after a throttle.
  it("waits from 1,000 ms after a throttle, 3 attempts in all", () => {
    expect(waitsBeforeRetries("refuser", preset)).toEqual(waits(500, 1_000));
  });

  // Fails if the preset waits from 1,000 ms after a transient error (a
  // timeout), or from any base but the SDK's 50 ms.
  it("waits from 50 ms after a transient error", () => {
    expect(waitsBeforeRetries("db", preset)).toEqual(waits(25, 50));
  });

  // Fails if the engine resolves the preset without the target's
  // sdkRetryDefaults, so it waits from 50 ms and stops at 3 attempts.
  it("waits from 25 ms after a transient error into DynamoDB, 4 attempts in all", () => {
    expect(waitsBeforeRetries("slow-table", preset)).toEqual(
      waits(12.5, 25, 50),
    );
  });

  // Fails if DynamoDB's sdkRetryDefaults change the throttle's base delay
  // as well as the transient one.
  it("still waits from 1,000 ms after a throttle into DynamoDB", () => {
    expect(waitsBeforeRetries("tiny-table", preset)).toEqual(
      waits(500, 1_000, 2_000),
    );
  });

  // Fails if the target type's maxAttempts wins over the edge's own.
  it("makes the edge's own attempts, over its target type's", () => {
    expect(
      waitsBeforeRetries("tiny-table", { ...preset, maxAttempts: 2 }),
    ).toEqual(waits(500));
  });
});

describe("a custom policy", () => {
  // Fails if a custom policy's one base delay applies to one kind only, or
  // if the target type's sdkRetryDefaults reach a custom policy.
  it.each([
    ["a throttle", "tiny-table"],
    ["a transient error", "slow-table"],
  ])("waits from its one base delay after %s, as before", (_kind, target) => {
    const custom: EdgeRetry = {
      maxAttempts: 3,
      backoff: "exponential-jitter",
      baseDelayMs: 100,
    };
    expect(waitsBeforeRetries(target, custom)).toEqual(waits(50, 100));
  });
});
