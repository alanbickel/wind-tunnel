import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import {
  simulateWithMetrics,
  type MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import { sampleRecord } from "../../application/testing/sample-record";
import { InProcessSimulationRunner } from "./in-process-simulation-runner";

const registry = createAwsComponentRegistry();
const { project } = sampleRecord;
const workloadId = project.workloads[0]?.id ?? "";

describe("InProcessSimulationRunner", () => {
  it("resolves with the same run as simulateWithMetrics", async () => {
    const runner = new InProcessSimulationRunner({ registry });

    const run = await runner.run({ project, workloadId });

    expect(run).toEqual(simulateWithMetrics({ project, workloadId, registry }));
    expect(run.snapshots.length).toBeGreaterThan(0);
  });

  it("streams every snapshot, in order, before resolving", async () => {
    const runner = new InProcessSimulationRunner({ registry });
    const received: MetricsSnapshot[] = [];

    const promise = runner.run({ project, workloadId }, (snapshot) =>
      received.push(snapshot),
    );
    const streamedBeforeResolving = [...received];
    const run = await promise;

    expect(streamedBeforeResolving).toEqual(run.snapshots);
  });

  it("rejects, rather than throws, when the engine fails", async () => {
    const runner = new InProcessSimulationRunner({ registry });

    const promise = runner.run({ project, workloadId: "nope" });

    await expect(promise).rejects.toThrow('No workload "nope"');
  });
});
