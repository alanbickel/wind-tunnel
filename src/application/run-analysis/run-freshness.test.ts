import { describe, expect, it } from "vitest";
import type { Component, Project, Workload } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { runIsCurrent } from "./run-freshness";

const ran = sampleRecord.project;

/** Whether a run of `ran`'s steady workload is current against `project`. */
function currentAgainst(project: Project): boolean {
  return runIsCurrent({ ran, workloadId: "steady", project });
}

/** `ran` with its table component changed by `change`. */
function withTable(change: (table: Component) => Component): Project {
  const components = ran.architecture.components.map((component) =>
    component.id === "table" ? change(component) : component,
  );
  return { ...ran, architecture: { ...ran.architecture, components } };
}

/** `ran` with its table's read capacity set to `readUnitsPerSec`. */
function withReadUnits(readUnitsPerSec: number): Project {
  return withTable((table) => ({
    ...table,
    config: { ...table.config, readUnitsPerSec },
  }));
}

/** `ran` with its steady workload changed by `change`. */
function withSteady(change: (steady: Workload) => Workload): Project {
  return { ...ran, workloads: ran.workloads.map(change) };
}

const another: Workload = {
  id: "spike",
  name: "Spike",
  durationMs: 1_000,
  seed: 2,
  mix: [{ workflowId: "read", weight: 1 }],
  profile: [{ atMs: 0, requestsPerSec: 100 }],
};

describe("runIsCurrent", () => {
  // Fails if it compares by reference, not content: a rebuilt copy of the
  // same project would read as out of date.
  it("is current against the same content, however it was built", () => {
    const rebuilt = JSON.parse(JSON.stringify(ran)) as Project;
    expect(currentAgainst(rebuilt)).toBe(true);
  });

  // Fails if any of what ran drops out of the comparison: the
  // architecture's settings, names, or edges, the workflows, or the run
  // workload.
  it.each<[string, Project]>([
    ["a setting", withReadUnits(2_000)],
    [
      "a component's name",
      withTable((table) => ({ ...table, name: "Orders" })),
    ],
    [
      "an edge",
      {
        ...ran,
        architecture: {
          ...ran.architecture,
          edges: ran.architecture.edges.map((edge) => ({
            ...edge,
            latencyMs: edge.latencyMs + 1,
          })),
        },
      },
    ],
    [
      "a step",
      {
        ...ran,
        workflows: ran.workflows.map((workflow) => ({
          ...workflow,
          root: { ...workflow.root, calls: [] },
        })),
      },
    ],
    [
      "the run workload's duration",
      withSteady((steady) => ({ ...steady, durationMs: 6_000 })),
    ],
    ["the run workload's removal", { ...ran, workloads: [] }],
  ])("is out of date after a change to %s", (_, project) => {
    expect(currentAgainst(project)).toBe(false);
  });

  // Fails if something that doesn't change the run's results counts: the
  // project's name or description, or a workload that didn't run.
  it.each<[string, Project]>([
    ["the project's name", { ...ran, name: "Renamed" }],
    ["the project's description", { ...ran, description: undefined }],
    ["another workload", { ...ran, workloads: [...ran.workloads, another] }],
  ])("stays current after a change to %s", (_, project) => {
    expect(currentAgainst(project)).toBe(true);
  });

  // Fails if freshness keeps a count of changes rather than comparing
  // content: changing a setting back would leave the run out of date.
  it("is current again once a setting is changed back", () => {
    expect(currentAgainst(withReadUnits(2_000))).toBe(false);
    expect(currentAgainst(withReadUnits(1_000))).toBe(true);
  });
});
