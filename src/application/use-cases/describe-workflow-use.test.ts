import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import type { WorkflowDetails } from "../details/details";
import { awsDescribeSelection } from "../testing/aws-describe-selection";
import { sampleRecord } from "../testing/sample-record";

// A workflow's "Used by", as DescribeSelection describes it: the workloads
// whose mix has it, each with its share. The rest of a workflow's details
// are describe-selection.test.ts's.

const describeSelection = awsDescribeSelection();
const sample = sampleRecord.project;
const [steady] = sample.workloads;
if (steady === undefined) throw new Error("sample has no workload");

/** The workloads that use the workflow, as its details give them. */
function usedByOf(
  project: Project,
  workflowId: string,
): WorkflowDetails["usedBy"] {
  const details = describeSelection.execute({
    project,
    selection: { kind: "workflow", workflowId },
  });
  if (details?.kind !== "workflow") throw new Error(`No ${workflowId}`);
  return details.usedBy;
}

describe("DescribeSelection's workflow use", () => {
  // Fails if "Used by" misses a workload whose mix has the workflow, lists
  // one whose mix doesn't, loses the project's order, or gives a share that
  // isn't the workflow's of that workload's mix.
  it("names the workloads that use a workflow, each with its share", () => {
    const spike = {
      ...steady,
      id: "spike",
      name: "Spike",
      mix: [
        { workflowId: "other", weight: 2 },
        { workflowId: "read", weight: 1 },
      ],
    };
    const project: Project = {
      ...sample,
      workloads: [
        spike,
        { ...steady, id: "none", name: "None", mix: [] },
        steady,
      ],
    };

    expect(usedByOf(project, "read")).toEqual([
      { workloadName: "Spike", shareText: "33.3%" },
      { workloadName: "Steady", shareText: "100.0%" },
    ]);
    expect(usedByOf({ ...project, workloads: [] }, "read")).toEqual([]);
  });

  // Fails if a workload whose mix has no positive weight, so no shares,
  // throws, or gives the workflow a share ("0.0%", "undefined%") rather
  // than none.
  it("gives no share for a workload whose mix weighs nothing", () => {
    const idle = { ...steady, mix: [{ workflowId: "read", weight: 0 }] };
    const project: Project = { ...sample, workloads: [idle] };

    expect(usedByOf(project, "read")).toEqual([
      { workloadName: "Steady", shareText: undefined },
    ]);
  });

  // Fails if a workflow's share in "Used by" is rounded apart from its row
  // in the workload's mix, which gives the last tenths to the largest
  // remainders so the shares add up to 100.0%.
  it("gives each workload's share as its mix row does", () => {
    const thirds = {
      ...steady,
      mix: ["read", "a", "b"].map((workflowId) => ({ workflowId, weight: 1 })),
    };
    const project: Project = { ...sample, workloads: [thirds] };
    const workload = describeSelection.execute({
      project,
      selection: { kind: "workload", workloadId: thirds.id },
    });
    const row =
      workload?.kind === "workload"
        ? workload.mix.rows.find((r) => r.workflowId === "read")
        : undefined;

    expect(row?.shareText).toBe("33.4%");
    expect(usedByOf(project, "read")[0]?.shareText).toBe(row?.shareText);
  });
});
