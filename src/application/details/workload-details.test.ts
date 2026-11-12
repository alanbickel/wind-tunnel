import { describe, expect, it } from "vitest";
import type { Project, Workload } from "../../domain/model/project";
import type { WorkloadDetails } from "./details";
import { awsDescribeSelection } from "../testing/aws-describe-selection";
import { sampleRecord } from "../testing/sample-record";
import { shareText } from "./mix-shares";
import { WORKFLOW_GONE_TEXT } from "./workload-details";

const describeSelection = awsDescribeSelection();
const sample = sampleRecord.project;
const [read] = sample.workflows;
if (read === undefined) throw new Error("The sample has a workflow");

/** The sample with its one workload replaced. */
function withWorkload(workload: Partial<Workload>): Project {
  const [steady] = sample.workloads;
  if (steady === undefined) throw new Error("The sample has a workload");
  return { ...sample, workloads: [{ ...steady, ...workload }] };
}

function workloadIn(project: Project): WorkloadDetails {
  const [workload] = project.workloads;
  const details = describeSelection.execute({
    project,
    selection: { kind: "workload", workloadId: workload?.id ?? "" },
  });
  if (details?.kind !== "workload") throw new Error("No workload");
  return details;
}

describe("a workload's details", () => {
  // Fails if a value, a mix row, its share, or a profile row is dropped or
  // shown as an id, or the shares don't total 100%.
  it("gives its values, its mix with shares, and its profile", () => {
    const details = workloadIn(
      withWorkload({
        durationMs: 45_000,
        seed: 7,
        mix: [{ workflowId: "read", weight: 4 }],
        profile: [
          { atMs: 0, requestsPerSec: 10 },
          { atMs: 60_000, requestsPerSec: 30 },
        ],
      }),
    );

    expect(details.name).toBe("Steady");
    expect([details.durationSec, details.seed]).toEqual([45, 7]);
    expect(details.mix.rows).toEqual([
      {
        workflowId: "read",
        workflowName: "Read item",
        workflowGone: false,
        weight: 4,
        shareText: "100.0%",
        issues: [],
      },
    ]);
    expect(details.mix.totalText).toBe("Shares total 100%");
    expect(details.mix.emptyText).toBeUndefined();
    expect(
      details.profile.rows.map((r) => [r.timeSec, r.requestsPerSec]),
    ).toEqual([
      [0, 10],
      [60, 30],
    ]);
    expect(details.profile.rows.map((r) => r.note !== undefined)).toEqual([
      false,
      true,
    ]);
  });

  // Fails if the rows' shares, as shown, don't add to exactly 100.0%.
  it("shows shares that add up", () => {
    const entries = ["a", "b", "c"].map((id) => ({
      id,
      name: id,
      root: read.root,
    }));
    const details = workloadIn({
      ...withWorkload({
        mix: entries.map(({ id }) => ({ workflowId: id, weight: 1 })),
      }),
      workflows: entries,
    });

    const shown = details.mix.rows.map((row) => row.shareText);

    expect(shown).toEqual(["33.4%", "33.3%", "33.3%"]);
    expect(
      shown.reduce((sum, text) => sum + Number.parseFloat(text ?? "0"), 0),
    ).toBeCloseTo(100);
    expect(shareText(334)).toBe(shown[0]);
  });

  // Fails if an empty mix has no words, or still says its shares total.
  it("says so when the mix is empty", () => {
    const details = workloadIn(withWorkload({ mix: [] }));

    expect(details.mix.emptyText).toBe(
      "No workflows in the mix. A workload with an empty mix can't run.",
    );
    expect(details.mix.totalText).toBeUndefined();
    expect(details.mix.issues).toEqual(["The mix has no workflows."]);
  });

  // Fails if any of the stored workload's issues lands on another row, on
  // the section instead of its row, or is dropped.
  it("puts each issue on its own row", () => {
    const details = workloadIn(
      withWorkload({
        mix: [
          { workflowId: "read", weight: 1 },
          { workflowId: "read", weight: 0 },
          { workflowId: "gone", weight: 1 },
        ],
        profile: [
          { atMs: 5_000, requestsPerSec: 10 },
          { atMs: 5_000, requestsPerSec: -1 },
        ],
      }),
    );

    expect(details.mix.rows.map((row) => row.issues.length)).toEqual([0, 2, 1]);
    expect(details.mix.rows[1]?.issues.join(" ")).toMatch(/more than once/);
    expect(details.mix.rows[1]?.issues.join(" ")).toMatch(
      /weights must be positive/,
    );
    expect(details.mix.rows[2]?.issues.join(" ")).toMatch(
      /isn't in the project/,
    );
    expect(details.profile.rows.map((row) => row.issues.length)).toEqual([
      0, 2,
    ]);
    expect(details.profile.rows[1]?.issues.join(" ")).toMatch(
      /times must increase/,
    );
    expect(details.profile.rows[1]?.issues.join(" ")).toMatch(
      /can't be negative/,
    );
    expect([details.mix.issues, details.profile.issues]).toEqual([[], []]);
  });

  // Fails if a mix entry whose workflow is gone shows its id.
  it("names a missing workflow in words, never by its id", () => {
    const details = workloadIn(
      withWorkload({ mix: [{ workflowId: "wf-123", weight: 1 }] }),
    );

    expect(details.mix.rows[0]).toMatchObject({
      workflowName: WORKFLOW_GONE_TEXT,
      workflowGone: true,
    });
  });

  // Fails if "Add to mix" offers a workflow already in the mix, skips one
  // that isn't, or lists them out of project order.
  it("offers the workflows not in the mix, in project order", () => {
    const names = ["a", "b", "c"];
    const workflows = names.map((id) => ({ id, name: id, root: read.root }));
    const details = workloadIn({
      ...withWorkload({ mix: [{ workflowId: "b", weight: 1 }] }),
      workflows,
    });

    expect(details.mix.addable).toEqual([
      { workflowId: "a", name: "a" },
      { workflowId: "c", name: "c" },
    ]);
    expect(details.mix.addUnusableText).toBeUndefined();
  });

  // Fails if the two reasons "Add to mix" can't offer anything swap or go
  // unsaid.
  it("says why nothing can be added", () => {
    const full = workloadIn(
      withWorkload({ mix: [{ workflowId: "read", weight: 1 }] }),
    );
    const none = workloadIn({ ...withWorkload({ mix: [] }), workflows: [] });

    expect(full.mix.addable).toEqual([]);
    expect(full.mix.addUnusableText).toBe(
      "Every workflow is already in the mix.",
    );
    expect(none.mix.addUnusableText).toBe("Add a workflow first.");
  });

  // Fails if an empty profile's issue lands on a row, or is dropped.
  it("puts an empty profile's issue on the profile", () => {
    const details = workloadIn(withWorkload({ profile: [] }));

    expect(details.profile.issues).toEqual(["The profile has no points."]);
  });

  // Fails if a project without the workload still describes one.
  it("is undefined for a workload the project doesn't have", () => {
    const details = describeSelection.execute({
      project: sample,
      selection: { kind: "workload", workloadId: "nope" },
    });

    expect(details).toBeUndefined();
  });
});
