import type { Project, Workload } from "../../domain/model/project";
import type { ValidationIssue } from "../../domain/model/validation-issue";
import type {
  MixDetails,
  MixRowDetails,
  ProfileDetails,
  ProfileRowDetails,
  WorkloadDetails,
} from "./details";
import { mixShares, shareText } from "./mix-shares";
import { profileNotes } from "./profile-notes";

/** A workload, in its project, with its own issues. */
export interface WorkloadDetailsInput {
  readonly project: Project;
  readonly workload: Workload;
  /** The workload's own issues, with their paths into the project. */
  readonly issues: readonly ValidationIssue[];
}

/** What Details says for a mix entry whose workflow the project no longer has. */
export const WORKFLOW_GONE_TEXT =
  "A workflow that is no longer in the project.";

/** What Details says of a mix with no entries. */
export const EMPTY_MIX_TEXT =
  "No workflows in the mix. A workload with an empty mix can't run.";

/**
 * A workload's details: its values, its mix with shares that add to
 * exactly 100.0%, and its profile with a note on each point past the run's
 * end, each issue on the row its path leads to.
 */
export function workloadDetails(input: WorkloadDetailsInput): WorkloadDetails {
  const { workload } = input;
  const durationSec = workload.durationMs / 1000;
  return {
    kind: "workload",
    workloadId: workload.id,
    name: workload.name,
    durationSec,
    durationText: `${String(durationSec)} ${durationSec === 1 ? "second" : "seconds"}`,
    seed: workload.seed,
    mix: mixDetails(input),
    profile: profileDetails(input),
  };
}

/** The issues of one section, each by the index of the row it's on. */
interface SectionIssues {
  /** The issues on the section itself, such as an empty mix. */
  readonly own: readonly string[];
  /** The issues on each row, by its index. */
  readonly rows: ReadonlyMap<number, readonly string[]>;
}

/**
 * The issues whose path, below the workload's own, goes to `section`: on a
 * row when it names an index (`["mix", 1, "weight"]`), else on the section.
 */
function sectionIssues(
  issues: readonly ValidationIssue[],
  section: "mix" | "profile",
): SectionIssues {
  const own: string[] = [];
  const rows = new Map<number, string[]>();
  for (const { path, message } of issues) {
    // ["workloads", index, section, row?, field?]
    if (path[2] !== section) continue;
    const row = path[3];
    if (typeof row !== "number") {
      own.push(message);
      continue;
    }
    rows.set(row, [...(rows.get(row) ?? []), message]);
  }
  return { own, rows };
}

function mixDetails({ project, workload, issues }: WorkloadDetailsInput) {
  const { own, rows } = sectionIssues(issues, "mix");
  const shares = mixShares(workload.mix.map((entry) => entry.weight));
  const workflowNames = new Map(project.workflows.map((w) => [w.id, w.name]));
  const mixRows = workload.mix.map((entry, index): MixRowDetails => {
    const name = workflowNames.get(entry.workflowId);
    const share = shares?.[index];
    return {
      workflowName: name ?? WORKFLOW_GONE_TEXT,
      workflowGone: name === undefined,
      weight: entry.weight,
      shareText: share === undefined ? undefined : shareText(share),
      issues: rows.get(index) ?? [],
    };
  });
  const details: MixDetails = {
    rows: mixRows,
    emptyText: mixRows.length === 0 ? EMPTY_MIX_TEXT : undefined,
    totalText: shares && "Shares total 100%",
    issues: own,
  };
  return details;
}

function profileDetails({
  workload,
  issues,
}: WorkloadDetailsInput): ProfileDetails {
  const { own, rows } = sectionIssues(issues, "profile");
  const { profile, durationMs } = workload;
  const notes = profileNotes({ profile, durationMs });
  return {
    rows: profile.map(({ atMs, requestsPerSec }, index): ProfileRowDetails => ({
      timeSec: atMs / 1000,
      requestsPerSec,
      note: notes[index],
      issues: rows.get(index) ?? [],
    })),
    issues: own,
  };
}
