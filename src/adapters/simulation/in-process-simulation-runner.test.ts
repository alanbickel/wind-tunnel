import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import { checkSimulationRunnerContract } from "../../application/testing/check-simulation-runner-contract";
import { sampleRecord } from "../../application/testing/sample-record";
import { InProcessSimulationRunner } from "./in-process-simulation-runner";

const registry = createAwsComponentRegistry();
const { project } = sampleRecord;
const workloadId = project.workloads[0]?.id ?? "";
const request = { project, workloadId };

describe("InProcessSimulationRunner", () => {
  it("keeps the SimulationRunner contract", async () => {
    const runner = new InProcessSimulationRunner({ registry });

    expect(await checkSimulationRunnerContract(runner, request)).toEqual([]);
  });

  it("finishes with the same run as simulateWithMetrics", async () => {
    const runner = new InProcessSimulationRunner({ registry });

    const outcome = await runner.run({ request });

    expect(outcome).toEqual({
      status: "finished",
      run: simulateWithMetrics({ project, workloadId, registry }),
    });
  });

  it("rejects, rather than throws, when the engine fails", async () => {
    const runner = new InProcessSimulationRunner({ registry });

    const promise = runner.run({ request: { project, workloadId: "nope" } });

    await expect(promise).rejects.toThrow('No workload "nope"');
  });
});
