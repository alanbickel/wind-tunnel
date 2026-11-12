import { describe, expect, it } from "vitest";
import type { WorkloadDetails } from "../../../application/details/details";
import { awsDescribeSelection } from "../../../application/testing/aws-describe-selection";
import type { Project, Workload } from "../../../domain/model/project";
import { projectA, projectB } from "../testing/scenario-runs";

// The worked example in docs/architecture/workload-editor.md: each
// template's workloads as Details shows them, read-only. Accept an
// intended change with `npx vitest run src/adapters/templates/details
// --update`, then check the guide still matches.

const describeSelection = awsDescribeSelection();

/** A workload of the project, as Details describes it. */
function detailsOf(project: Project, { id }: Workload): WorkloadDetails {
  const details = describeSelection.execute({
    project,
    selection: { kind: "workload", workloadId: id },
  });
  if (details?.kind !== "workload") throw new Error(`No workload ${id}`);
  return details;
}

/** An issue, as the screen marks it. */
function problem(message: string): string {
  return `    Problem: ${message}`;
}

/** A workload's Details, as lines of text, in the order the screen shows them. */
function linesOf(details: WorkloadDetails): string[] {
  const { mix, profile } = details;
  return [
    details.name,
    `Duration: ${String(details.durationSec)} seconds. Seed: ${String(details.seed)}.`,
    "Mix",
    ...mix.issues.map(problem),
    ...(mix.emptyText === undefined ? [] : [`  ${mix.emptyText}`]),
    ...mix.rows.flatMap((row) => [
      `  ${row.workflowName}  weight ${String(row.weight)}  ${row.shareText ?? "-"}`,
      ...row.issues.map(problem),
    ]),
    ...(mix.totalText === undefined ? [] : [`  ${mix.totalText}`]),
    "Profile (time in s, rate in requests/s)",
    ...profile.issues.map(problem),
    ...profile.rows.flatMap((row) => [
      `  ${String(row.timeSec)}  ${String(row.requestsPerSec)}`,
      ...(row.note === undefined ? [] : [`    ${row.note}`]),
      ...row.issues.map(problem),
    ]),
  ];
}

/** A template's workloads, one block each. */
function trace(title: string, project: Project): string {
  const blocks = project.workloads.map((workload) =>
    linesOf(detailsOf(project, workload)).join("\n"),
  );
  return [`${title}: ${project.name}`, ...blocks].join("\n\n");
}

/**
 * A stored workload broken by hand: Template A's steady day with its mix
 * emptied and its run cut to 30 s, so its second profile point is past the end.
 */
function brokenTrace(project: Project): string {
  const [, steady] = project.workloads;
  if (steady === undefined) throw new Error("Template A has a steady day");
  const broken = {
    ...steady,
    name: "Steady day, broken",
    mix: [],
    durationMs: 30_000,
  };
  const edited = { ...project, workloads: [broken] };
  return `A hand-broken workload\n\n${linesOf(detailsOf(edited, broken)).join("\n")}`;
}

describe("traces", () => {
  // Fails if a template's workload values, mix rows, shares, profile rows,
  // or notes past the run's end change without the guide's trace changing too.
  it("each template's workloads, as Details shows them", async () => {
    const text = `${[
      trace("Template A", projectA),
      trace("Template B", projectB),
      brokenTrace(projectA),
    ].join("\n\n")}\n`;

    await expect(text).toMatchFileSnapshot("workload-details.txt");
  });
});
