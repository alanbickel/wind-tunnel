import type { Project, Workload } from "../../domain/model/project";
import type { ValidationIssue } from "../../domain/model/validation-issue";
import type {
  MixDetails,
  MixRowDetails,
  ProfileDetails,
  ProfileRowDetails,
  SendsDetails,
  WorkloadDetails,
} from "./details";
import { count } from "../run-analysis/number-format";
import { mixShares, shareText } from "./mix-shares";
import { workloadSends } from "./workload-sends";
import { profileLine } from "./profile-line";
import { profileNotes } from "./profile-notes";
import { workloadRemovalText } from "./removal-text";

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

/** What "Add to mix" says when every workflow is already in the mix. */
export const ALL_IN_MIX_TEXT = "Every workflow is already in the mix.";

/** What "Add to mix" says when the project has no workflows. */
export const NO_WORKFLOWS_TEXT = "Add a workflow first.";

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
    seed: workload.seed,
    removal: workloadRemovalText(workload),
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
  const mixRows = mixRowDetails({ project, workload }, rows);
  const inMix = new Set(workload.mix.map((entry) => entry.workflowId));
  const addable = project.workflows
    .filter((w) => !inMix.has(w.id))
    .map((w) => ({ workflowId: w.id, name: w.name }));
  const details: MixDetails = {
    rows: mixRows,
    emptyText: mixRows.length === 0 ? EMPTY_MIX_TEXT : undefined,
    totalText: mixRows.some((row) => row.shareTenths !== undefined)
      ? "Shares total 100%"
      : undefined,
    issues: own,
    addable,
    addUnusableText: addUnusableText(project, addable.length),
    sends: sendsDetails({ workload, rows: mixRows }),
  };
  return details;
}

/** One row for each mix entry, with the issues on it by index. */
function mixRowDetails(
  { project, workload }: Pick<WorkloadDetailsInput, "project" | "workload">,
  issuesByRow: ReadonlyMap<number, readonly string[]>,
): MixRowDetails[] {
  const shares = mixShares(workload.mix.map((entry) => entry.weight));
  const workflowNames = new Map(project.workflows.map((w) => [w.id, w.name]));
  const colorIndexes = new Map(project.workflows.map((w, i) => [w.id, i]));
  return workload.mix.map((entry, index): MixRowDetails => {
    const name = workflowNames.get(entry.workflowId);
    const share = shares?.[index];
    return {
      workflowId: entry.workflowId,
      workflowName: name ?? WORKFLOW_GONE_TEXT,
      workflowGone: name === undefined,
      weight: entry.weight,
      shareText: share === undefined ? undefined : shareText(share),
      shareTenths: share,
      colorIndex: colorIndexes.get(entry.workflowId),
      issues: issuesByRow.get(index) ?? [],
    };
  });
}

interface SendsDetailsInput {
  readonly workload: Workload;
  readonly rows: readonly MixRowDetails[];
}

/** "What this sends": the totals, and each workflow's part of them. */
function sendsDetails({
  workload,
  rows,
}: SendsDetailsInput): SendsDetails | undefined {
  const sends = workloadSends(workload);
  if (sends === undefined) return undefined;
  const parts = sends.perEntryRequests ?? [];
  return {
    totalText: `About ${count(sends.totalRequests)} requests before the run ends`,
    peakText: `Peak rate ${count(sends.peakRequestsPerSec)} requests/s`,
    rows: parts.map((requests, index) => ({
      workflowName: rows[index]?.workflowName ?? WORKFLOW_GONE_TEXT,
      text: `About ${count(requests)} requests`,
      colorIndex: rows[index]?.colorIndex,
    })),
  };
}

/** Why nothing can be added to the mix, or undefined if something can. */
function addUnusableText(
  project: Project,
  addableCount: number,
): string | undefined {
  if (addableCount > 0) return undefined;
  return project.workflows.length === 0 ? NO_WORKFLOWS_TEXT : ALL_IN_MIX_TEXT;
}

function profileDetails({
  workload,
  issues,
}: WorkloadDetailsInput): ProfileDetails {
  const { own, rows } = sectionIssues(issues, "profile");
  const { profile, durationMs } = workload;
  const notes = profileNotes({ profile, durationMs });
  return {
    line: profileLine(workload),
    rows: profile.map(({ atMs, requestsPerSec }, index): ProfileRowDetails => ({
      atMs,
      timeSec: atMs / 1000,
      requestsPerSec,
      note: notes[index],
      issues: rows.get(index) ?? [],
    })),
    issues: own,
  };
}
