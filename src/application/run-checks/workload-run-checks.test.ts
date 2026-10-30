import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { Project, Workflow } from "../../domain/model/project";
import { projectWithRunIssue } from "../testing/project-with-run-issue";
import { sampleRecord } from "../testing/sample-record";
import { workloadRunChecks } from "./workload-run-checks";

const registry = createAwsComponentRegistry();

const checksOf = (project: Project) => workloadRunChecks({ project, registry });

/** "Write item" under another ID and name: the same missing component. */
function writeAgain(): Workflow {
  const [, write] = projectWithRunIssue.workflows;
  if (write === undefined) throw new Error("The fixture has Write item");
  return { ...write, id: "write-again", name: "Write again" };
}

describe("workloadRunChecks", () => {
  // Fails if a workload's check leaves out its mix's workflows' issues, or
  // one workload's issues stop another.
  it("gives a workload its workflows' issues, and leaves a sound one alone", () => {
    const checks = checksOf(projectWithRunIssue);

    expect(checks.get("steady")).toEqual({
      workloadId: "steady",
      canRun: true,
      issues: [],
      reasons: [],
      summary: "",
    });
    expect(checks.get("write-rush")).toEqual({
      workloadId: "write-rush",
      canRun: false,
      issues: [
        {
          path: ["workflows", 1, "root", "calls", 0, "calls", 0, "componentId"],
          message:
            "Write item calls a component that isn't in the architecture any more.",
        },
      ],
      reasons: [
        "Write item calls a component that isn't in the architecture any more.",
      ],
      summary:
        "Write rush can't run yet: Write item calls a component that isn't in the architecture any more.",
    });
  });

  // Fails if a broken workflow that no workload runs stops one.
  it("ignores a workflow that isn't in the workload's mix", () => {
    const project = {
      ...projectWithRunIssue,
      workloads: sampleRecord.project.workloads,
    };
    expect(checksOf(project).get("steady")?.canRun).toBe(true);
  });

  // Fails if groupByIssue stops grouping, or the workload's own issues are
  // left out or put after its workflows'.
  it("says an issue workflows share once, after the workload's own", () => {
    const [steady, writeRush] = projectWithRunIssue.workloads;
    if (steady === undefined || writeRush === undefined) {
      throw new Error("The fixture has two workloads");
    }
    const mix = [...writeRush.mix, { workflowId: "write-again", weight: 1 }];
    const project = {
      ...projectWithRunIssue,
      workflows: [...projectWithRunIssue.workflows, writeAgain()],
      workloads: [steady, { ...writeRush, mix, profile: [] }],
    };

    const check = checksOf(project).get("write-rush");

    expect(check?.summary).toBe(
      "Write rush can't run yet: The profile has no points. Write item and Write again call a component that isn't in the architecture any more.",
    );
    expect(check?.issues.map((issue) => issue.message)).toEqual([
      "The profile has no points.",
      "Write item calls a component that isn't in the architecture any more.",
      "Write again calls a component that isn't in the architecture any more.",
    ]);
  });

  // Fails if step issues are grouped by anything the sentence doesn't say,
  // such as the removed component's ID: the two calls read the same.
  it("says a reason once, however many issues read as it", () => {
    const [, write] = projectWithRunIssue.workflows;
    if (write === undefined) throw new Error("The fixture has Write item");
    const twoGone: Workflow = {
      ...write,
      root: {
        componentId: "api",
        action: "invoke",
        calls: [
          { componentId: "gone-1", action: "invoke" },
          { componentId: "gone-2", action: "invoke" },
        ],
      },
    };
    const [read] = projectWithRunIssue.workflows;
    if (read === undefined) throw new Error("The fixture has Read item");
    const project = { ...projectWithRunIssue, workflows: [read, twoGone] };

    const check = checksOf(project).get("write-rush");

    expect(check?.issues).toHaveLength(2);
    expect(check?.reasons).toEqual([
      "Write item calls a component that isn't in the architecture any more.",
    ]);
  });

  // Fails if step issues are grouped by the removed component's ID: Write
  // item would be named again, in a second sentence for gone-2.
  it("names each workflow once when their removed components overlap", () => {
    const calling = (id: string, name: string, componentIds: string[]) => ({
      id,
      name,
      root: {
        componentId: "api",
        action: "invoke" as const,
        calls: componentIds.map((componentId) => ({
          componentId,
          action: "invoke" as const,
        })),
      },
    });
    const project: Project = {
      ...projectWithRunIssue,
      workflows: [
        calling("read", "Read item", ["gone-1"]),
        calling("write", "Write item", ["gone-1", "gone-2"]),
      ],
      workloads: [
        {
          id: "both",
          name: "Both",
          durationMs: 5_000,
          seed: 1,
          mix: [
            { workflowId: "read", weight: 1 },
            { workflowId: "write", weight: 1 },
          ],
          profile: [{ atMs: 0, requestsPerSec: 20 }],
        },
      ],
    };

    expect(checksOf(project).get("both")?.summary).toBe(
      "Both can't run yet: Read item and Write item call a component that isn't in the architecture any more.",
    );
  });

  // Fails if the phrases name components by ID.
  it("names components by name", () => {
    const [read] = sampleRecord.project.workflows;
    if (read === undefined) throw new Error("The sample has a workflow");
    const skipsFn: Workflow = {
      ...read,
      root: {
        componentId: "api",
        action: "invoke",
        calls: [{ componentId: "table", action: "read" }],
      },
    };
    const project = { ...sampleRecord.project, workflows: [skipsFn] };

    expect(checksOf(project).get("steady")?.reasons).toEqual([
      "Read item calls Table from API, which has no edge to it.",
    ]);
  });
});
