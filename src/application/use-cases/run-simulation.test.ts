import { describe, expect, it } from "vitest";
import type { MetricsSnapshot } from "../../domain/metrics/metrics-collector";
import type { Project } from "../../domain/model/project";
import { ManualStopSignal } from "../testing/manual-stop-signal";
import {
  FAKE_RUN,
  RecordingSimulationRunner,
} from "../testing/recording-simulation-runner";
import { projectWithRunIssue } from "../testing/project-with-run-issue";
import { sampleRecord } from "../testing/sample-record";
import { awsRunSimulation } from "../testing/aws-run-simulation";

const steady = sampleRecord.project.workloads[0];
if (steady === undefined) throw new Error("sampleRecord has no workload");

/** The sample project with a second workload, `burst`, after `steady`. */
const project: Project = {
  ...sampleRecord.project,
  workloads: [steady, { ...steady, id: "burst", name: "Burst", seed: 9 }],
};

function setUp() {
  const runner = new RecordingSimulationRunner();
  return { runner, runSimulation: awsRunSimulation(runner) };
}

describe("RunSimulation", () => {
  it("runs the first workload unless told otherwise", async () => {
    const { runner, runSimulation } = setUp();

    const result = await runSimulation.execute({ project });

    expect(result).toEqual({
      status: "finished",
      project,
      workload: steady,
      run: FAKE_RUN,
    });
    expect(runner.requests).toEqual([{ project, workloadId: "steady" }]);
  });

  it("runs the workload asked for", async () => {
    const { runner, runSimulation } = setUp();

    await runSimulation.execute({ project, workloadId: "burst" });

    expect(runner.requests.map((r) => r.workloadId)).toEqual(["burst"]);
  });

  it("replaces the workload's seed in the project that runs", async () => {
    const { runner, runSimulation } = setUp();

    const result = await runSimulation.execute({
      project,
      workloadId: "burst",
      seed: 7,
    });

    const ran = runner.requests[0]?.project;
    expect(ran?.workloads.map((w) => [w.id, w.seed])).toEqual([
      ["steady", steady.seed],
      ["burst", 7],
    ]);
    expect(result).toMatchObject({ workload: { id: "burst", seed: 7 } });
    expect(project.workloads[1]?.seed).toBe(9);
  });

  it("passes each snapshot on as the run produces it", async () => {
    const { runSimulation } = setUp();
    const received: MetricsSnapshot[] = [];

    await runSimulation.execute({
      project,
      onSnapshot: (snapshot) => received.push(snapshot),
    });

    expect(received).toEqual(FAKE_RUN.snapshots);
  });

  it("reports an unknown workload without running anything", async () => {
    const { runner, runSimulation } = setUp();

    expect(
      await runSimulation.execute({ project, workloadId: "nope" }),
    ).toEqual({ status: "workload-missing", workloadId: "nope" });
    expect(runner.requests).toEqual([]);
  });

  it("reports a project with no workloads", async () => {
    const { runSimulation } = setUp();

    expect(
      await runSimulation.execute({ project: { ...project, workloads: [] } }),
    ).toEqual({ status: "workload-missing" });
  });

  it("hands the stop signal to the runner", async () => {
    const { runner, runSimulation } = setUp();
    const stopSignal = new ManualStopSignal();

    await runSimulation.execute({ project, stopSignal });

    expect(runner.inputs[0]?.stopSignal).toBe(stopSignal);
  });

  it("reports a stopped run, with the workload it was running", async () => {
    const { runSimulation } = setUp();
    const stopSignal = new ManualStopSignal();
    const seen: MetricsSnapshot[] = [];

    const result = await runSimulation.execute({
      project,
      stopSignal,
      onSnapshot: (snapshot) => {
        seen.push(snapshot);
        stopSignal.stop();
      },
    });

    expect(result).toEqual({ status: "stopped", project, workload: steady });
    expect(seen).toHaveLength(1);
  });

  // Fails if RunSimulation hands the runner a workload without checking it.
  it("refuses a workload with run issues, saying why, without running it", async () => {
    const { runner, runSimulation } = setUp();

    const result = await runSimulation.execute({
      project: projectWithRunIssue,
      workloadId: "write-rush",
    });

    expect(result).toMatchObject({
      status: "cant-run",
      workload: { id: "write-rush" },
      check: {
        canRun: false,
        summary:
          "Write rush can't run yet: Write item calls orders-db, which isn't in the architecture.",
      },
    });
    expect(runner.requests).toEqual([]);
  });

  // Fails if one workload's run issues stop every workload in the project.
  it("runs another workload in a project with run issues", async () => {
    const { runner, runSimulation } = setUp();

    const result = await runSimulation.execute({
      project: projectWithRunIssue,
      workloadId: "steady",
    });

    expect(result).toMatchObject({ status: "finished" });
    expect(runner.requests.map((r) => r.workloadId)).toEqual(["steady"]);
  });
});
