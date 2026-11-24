import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../../domain/components/aws";
import type { DynamoDbConfig } from "../../../domain/components/aws/dynamodb";
import { limitExhausted } from "../../../domain/metrics/limit-exhausted";
import { simulateWithMetrics } from "../../../domain/metrics/metrics-collector";
import {
  componentIn,
  rateLimitIn,
} from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import { sampleRecord } from "../../testing/sample-record";
import type { RunSoFar } from "../run-so-far";
import { createDetectors } from "./create-detectors";
import { findRun } from "./find-run";
import type { FindingNode } from "./order-findings";

/**
 * A table refilling 1 read unit a second, with no burst saved up, so its
 * bucket holds 100: the largest read. Each read is a 36 KB strongly
 * consistent one, costing 9 units, sent about 20 times a second. Eleven
 * reads leave 1 unit, and the bucket never refills the 9 the next one needs
 * in the run's 5 seconds, so it throttles with more than one unit left.
 */
const table: DynamoDbConfig = {
  readUnitsPerSec: 1,
  writeUnitsPerSec: 1,
  burstSec: 0,
  latency: { kind: "constant", valueMs: 5 },
};

const project: Project = {
  ...sampleRecord.project,
  architecture: {
    ...sampleRecord.project.architecture,
    components: sampleRecord.project.architecture.components.map((c) =>
      c.id === "table" ? { ...c, config: table } : c,
    ),
  },
  workflows: sampleRecord.project.workflows.map((w) => ({
    ...w,
    root: {
      ...w.root,
      calls: [
        {
          id: "fn-invoke",
          componentId: "fn",
          action: "invoke",
          calls: [
            {
              id: "table-read",
              componentId: "table",
              action: "read",
              settings: { itemSizeKb: 36, consistency: "strong" },
            },
          ],
        },
      ],
    },
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

describe("a bucket whose requests cost more than one token", () => {
  // Fails if a bucket counts as exhausted only with less than one token
  // left, as before #314: this one throttles every second with more than
  // one unit left, so no second would count as out, and the findings
  // couldn't name the bucket or explain how it drained.
  it("is out in each second it throttles, and the findings explain why", () => {
    const run = runOf();
    const seconds = run.snapshots.map((s) => ({
      rejected: componentIn(s, "table").rejected,
      bucket: rateLimitIn(componentIn(s, "table"), "readUnits"),
    }));
    expect(seconds.every(({ rejected }) => rejected > 0)).toBe(true);
    for (const { rejected, bucket } of seconds) {
      expect(bucket.peak).toBeLessThan(bucket.limit - 1);
      expect(bucket.refused).toBe(rejected);
      expect(limitExhausted(bucket)).toBe(true);
    }

    const atTable = flatten(findRun(run, createDetectors()).findings).filter(
      (f) => f.key.componentId === "table",
    );
    expect(atTable.find((f) => f.key.kind === "failed-requests")).toMatchObject(
      { limitNames: ["readUnits"] },
    );
    expect(atTable.find((f) => f.key.kind === "bucket-drained")).toMatchObject({
      explains: { componentId: "table", limitName: "readUnits" },
    });
  });
});
