import { describe, expect, it } from "vitest";
import type { Project } from "../../domain/model/project";
import { sampleRecord } from "../testing/sample-record";
import { checkWorkloadName } from "./workload-name";

const [steady] = sampleRecord.project.workloads;
if (steady === undefined) throw new Error("the sample has a workload");

const TAKEN = {
  status: "fails",
  message:
    "Another workload already uses this name. Please choose another name.",
};

/** The sample project with a second workload, "Lunch rush". */
const project: Project = {
  ...sampleRecord.project,
  workloads: [
    ...sampleRecord.project.workloads,
    { ...steady, id: "lunch", name: "Lunch rush" },
  ],
};

/** The "steady" workload's name field, with `text` typed in it. */
function check(text: string) {
  return checkWorkloadName({ project, workloadId: "steady", text });
}

describe("checkWorkloadName", () => {
  // Fails if the spaces around the draft stay in the saved name.
  it("drops the spaces around the name", () => {
    expect(check("  Dinner ")).toEqual({ status: "passes", value: "Dinner" });
  });

  // Fails if an empty name, or one of only spaces, passes, or the message
  // changes from the one the issue gives.
  it("refuses an empty name", () => {
    const fails = { status: "fails", message: "A workload needs a name." };
    expect(check("")).toEqual(fails);
    expect(check("   ")).toEqual(fails);
  });

  // Fails if another workload's name passes, or is compared with its case
  // or the spaces around it.
  it("refuses another workload's name, in any case", () => {
    expect(check("Lunch rush")).toEqual(TAKEN);
    expect(check(" lunch RUSH ")).toEqual(TAKEN);
  });

  // Fails if a workload's own name counts against it: "Steady" must be
  // able to become "STEADY", and the same name must pass.
  it("accepts the workload's own name, in another case", () => {
    expect(check("STEADY")).toEqual({ status: "passes", value: "STEADY" });
    expect(check("Steady")).toEqual({ status: "passes", value: "Steady" });
  });

  // Fails if the check compares with workflow names: a workflow and a
  // workload may share one.
  it("doesn't compare with workflow names", () => {
    expect(check("Read item")).toEqual({
      status: "passes",
      value: "Read item",
    });
  });

  // Fails if a stored project with two workloads of one name can't keep
  // them: each is refused only for the other's name when it changes.
  it("lets a stored duplicate keep its place, and refuses its name to others", () => {
    const twins: Project = {
      ...project,
      workloads: [
        ...project.workloads,
        { ...steady, id: "twin", name: "Steady" },
      ],
    };

    expect(
      checkWorkloadName({ project: twins, workloadId: "twin", text: "x" }),
    ).toEqual({ status: "passes", value: "x" });
    expect(
      checkWorkloadName({
        project: twins,
        workloadId: "lunch",
        text: "Steady",
      }),
    ).toEqual(TAKEN);
  });
});
