import { describe, expect, it } from "vitest";
import { checkSimulationRunnerContract } from "./check-simulation-runner-contract";
import { RecordingSimulationRunner } from "./recording-simulation-runner";
import { sampleRecord } from "./sample-record";

describe("RecordingSimulationRunner", () => {
  it("keeps the SimulationRunner contract, apart from failing", async () => {
    const request = { project: sampleRecord.project, workloadId: "steady" };

    const violations = await checkSimulationRunnerContract(
      new RecordingSimulationRunner(),
      request,
    );

    // It never simulates, so it can't fail the way an engine does.
    expect(violations).toEqual(["an engine failure rejects the run"]);
  });
});
