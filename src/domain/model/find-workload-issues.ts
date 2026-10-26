import type { MixEntry, Workload } from "./project";
import type { WorkloadIssue } from "./run-issue";
import type { IssuePath } from "./validation-issue";

/** A workload and where it is in the project. */
export interface WorkloadInput {
  readonly workload: Workload;
  /** E.g. `["workloads", 0]`. */
  readonly path: IssuePath;
}

/** What a workload's mix may refer to. */
export interface WorkloadContext {
  /** The IDs of the project's workflows. */
  readonly workflowIds: ReadonlySet<string>;
}

/**
 * A workload's own run issues: its mix has a workflow, names only workflows
 * that exist, each once, with positive weights; its profile has a point,
 * its times increase, and no rate is negative. Its workflows' steps are
 * checked apart, by `findStepIssues`.
 */
export function findWorkloadIssues(
  at: WorkloadInput,
  context: WorkloadContext,
): WorkloadIssue[] {
  return [...mixIssues(at, context), ...profileIssues(at)];
}

function mixIssues(
  { workload, path }: WorkloadInput,
  context: WorkloadContext,
): WorkloadIssue[] {
  const issues: WorkloadIssue[] = [];
  if (workload.mix.length === 0) {
    issues.push({ kind: "empty-mix", path: [...path, "mix"] });
  }
  const mixed = new Set<string>();
  workload.mix.forEach((entry, index) => {
    const entryPath = [...path, "mix", index];
    issues.push(...mixEntryIssues({ entry, path: entryPath, mixed }, context));
    mixed.add(entry.workflowId);
  });
  return issues;
}

/** A mix entry, where it is, and the workflows the entries before it named. */
interface MixEntryInput {
  readonly entry: MixEntry;
  readonly path: IssuePath;
  readonly mixed: ReadonlySet<string>;
}

/** The entry names a workflow that exists, for the first time, with a positive weight. */
function mixEntryIssues(
  { entry, path, mixed }: MixEntryInput,
  { workflowIds }: WorkloadContext,
): WorkloadIssue[] {
  const { workflowId, weight } = entry;
  const issues: WorkloadIssue[] = [];
  const idPath = [...path, "workflowId"];
  if (!workflowIds.has(workflowId)) {
    issues.push({ kind: "unknown-workflow", path: idPath, workflowId });
  }
  if (mixed.has(workflowId)) {
    issues.push({ kind: "repeated-workflow", path: idPath, workflowId });
  }
  if (!(weight > 0)) {
    const weightPath = [...path, "weight"];
    issues.push({
      kind: "weight-not-positive",
      path: weightPath,
      workflowId,
      weight,
    });
  }
  return issues;
}

function profileIssues({ workload, path }: WorkloadInput): WorkloadIssue[] {
  const { profile } = workload;
  const issues: WorkloadIssue[] = [];
  if (profile.length === 0) {
    issues.push({ kind: "empty-profile", path: [...path, "profile"] });
  }
  profile.forEach(({ atMs, requestsPerSec }, index) => {
    const pointPath = [...path, "profile", index];
    const previousAtMs = profile[index - 1]?.atMs;
    if (previousAtMs !== undefined && !(atMs > previousAtMs)) {
      issues.push({
        kind: "profile-time-not-increasing",
        path: [...pointPath, "atMs"],
        atMs,
        previousAtMs,
      });
    }
    if (!(requestsPerSec >= 0)) {
      const ratePath = [...pointPath, "requestsPerSec"];
      issues.push({
        kind: "negative-rate",
        path: ratePath,
        atMs,
        requestsPerSec,
      });
    }
  });
  return issues;
}
