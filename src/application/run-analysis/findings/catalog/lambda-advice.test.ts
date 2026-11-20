import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../../../domain/components/aws";
import type { LambdaConfig } from "../../../../domain/components/aws/lambda";
import { simulateWithMetrics } from "../../../../domain/metrics/metrics-collector";
import { componentIn } from "../../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../../domain/model/project";
import { sampleRecord } from "../../../testing/sample-record";
import { createDetectors } from "../create-detectors";
import { findRun } from "../find-run";
import type { FindingNode } from "../order-findings";
import type { RunSoFar } from "../../run-so-far";

/**
 * A 2 ms function that calls nothing, with concurrency 10, so a request
 * rate of 100 a second, sent 300 requests a second: it needs about 1 of
 * its 10 slots, but only a third of the requests get a token. A 1 ms cold
 * start keeps the first invocations from filling the slots.
 */
const fn: LambdaConfig = {
  concurrency: 10,
  coldStart: { kind: "constant", valueMs: 1 },
  idleTimeoutSec: 600,
  computeTime: { kind: "constant", valueMs: 2 },
};

const project: Project = {
  ...sampleRecord.project,
  architecture: {
    ...sampleRecord.project.architecture,
    components: sampleRecord.project.architecture.components.map((c) =>
      c.id === "fn" ? { ...c, config: fn } : c,
    ),
  },
  workflows: sampleRecord.project.workflows.map((w) => ({
    ...w,
    root: {
      ...w.root,
      calls: [{ id: "fn-invoke", componentId: "fn", action: "invoke" }],
    },
  })),
  workloads: sampleRecord.project.workloads.map((w) => ({
    ...w,
    profile: [{ atMs: 0, requestsPerSec: 300 }],
  })),
};

function runOf(): RunSoFar {
  const { snapshots } = simulateWithMetrics({
    project,
    workloadId: "steady",
    registry: createAwsComponentRegistry(),
  });
  return { project, workloadId: "steady", snapshots };
}

/** Every finding, with the causes beneath each, in order. */
function flatten(nodes: readonly FindingNode[]): FindingNode["finding"][] {
  return nodes.flatMap((n) => [n.finding, ...flatten(n.causes)]);
}

describe("Lambda's request rate in a run's findings", () => {
  // Fails if Lambda stops limiting its request rate (nothing fails), if the
  // findings name concurrency for a refusal the rate made, or if
  // lambda-advice.ts loses requestRate's fix or its Learn more.
  it("names requestRate, with a fix, while concurrency has room", () => {
    const run = runOf();
    const peakSlots = Math.max(
      ...run.snapshots.map(
        (s) =>
          componentIn(s, "fn").limits.find((l) => l.name === "concurrency")
            ?.peak ?? 0,
      ),
    );
    expect(peakSlots).toBeLessThan(10);

    const atFn = flatten(findRun(run, createDetectors()).findings).filter(
      (f) => f.key.componentId === "fn",
    );
    expect(atFn.length).toBeGreaterThan(0);
    for (const finding of atFn) {
      expect(finding.limitNames).toEqual(["requestRate"]);
    }
    const failed = atFn.find((f) => f.key.kind === "failed-requests");
    expect(failed?.fixes.map((f) => f.fidelityIds)).toEqual([
      ["LMB-1", "LMB-10"],
    ]);
    expect(failed?.learnMore).toBe(
      "fast-lambda-functions-hit-a-request-rate-limit-before-concurrency",
    );
  });
});
