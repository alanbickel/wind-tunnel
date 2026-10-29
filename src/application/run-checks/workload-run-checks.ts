import type { ComponentRegistry } from "../../domain/components/component-registry";
import {
  findRunIssues,
  type RunIssues,
} from "../../domain/components/find-run-issues";
import type { Project, Workload } from "../../domain/model/project";
import type { StepIssue, WorkloadIssue } from "../../domain/model/run-issue";
import type { ValidationIssue } from "../../domain/model/validation-issue";
import { componentNames } from "../run-analysis/component-names";
import {
  stepIssueKey,
  stepIssueText,
  workloadIssueText,
  type RunIssueNames,
  type StepIssueGroup,
} from "./run-issue-phrases";

/** Whether one workload can run, and if not, why. */
export interface WorkloadRunCheck {
  readonly workloadId: string;
  /** True when nothing stops a run of it. */
  readonly canRun: boolean;
  /**
   * Each issue that stops it, worded by name, with its path into the
   * project: the workload's own, then those of the workflows in its mix.
   */
  readonly issues: readonly ValidationIssue[];
  /**
   * The issues as sentences, an issue that several workflows share said
   * once, naming them all. Empty when it can run.
   */
  readonly reasons: readonly string[];
  /**
   * One message for the project bar: "Lunch rush can't run yet: Get order
   * and Create order call a component that isn't in the architecture any more."
   * Empty when it can run.
   */
  readonly summary: string;
}

/** Each workload's check, by workload ID. */
export type WorkloadRunChecks = ReadonlyMap<string, WorkloadRunCheck>;

export interface WorkloadRunChecksInput {
  /** A project whose architecture is valid, as every opened project's is. */
  readonly project: Project;
  readonly registry: ComponentRegistry;
}

/**
 * Which of a project's workloads can run (ADR-0019, decision 2). A
 * workload's run issues are its own and those of the workflows in its mix,
 * so a broken workflow stops only the workloads that use it.
 */
export function workloadRunChecks({
  project,
  registry,
}: WorkloadRunChecksInput): WorkloadRunChecks {
  const runIssues = findRunIssues(project, registry);
  const names = namesOf({ project, registry });
  return new Map(
    project.workloads.map((workload) => [
      workload.id,
      checkOf({ workload, runIssues }, names),
    ]),
  );
}

/** One workload of the project, to check on its own. */
export interface WorkloadRunCheckInput extends WorkloadRunChecksInput {
  /** One of the project's workloads. */
  readonly workload: Workload;
}

/** Whether one of a project's workloads can run, as `workloadRunChecks` says. */
export function workloadRunCheck(
  input: WorkloadRunCheckInput,
): WorkloadRunCheck {
  const runIssues = findRunIssues(input.project, input.registry);
  return checkOf({ workload: input.workload, runIssues }, namesOf(input));
}

/** How the project's components and workflows are named in messages. */
function namesOf({ project, registry }: WorkloadRunChecksInput): RunIssueNames {
  return {
    component: componentNames(project, registry),
    workflow: workflowNames(project),
  };
}

/** The workflow names of a project, by ID. */
function workflowNames(project: Project): RunIssueNames["workflow"] {
  const byId = new Map(project.workflows.map((w) => [w.id, w.name]));
  return (workflowId) => byId.get(workflowId) ?? workflowId;
}

interface CheckInput {
  readonly workload: Workload;
  readonly runIssues: RunIssues;
}

/** A step issue, and the workflow it's in. */
interface OwnedStepIssue {
  readonly issue: StepIssue;
  readonly workflowId: string;
}

function checkOf(at: CheckInput, names: RunIssueNames): WorkloadRunCheck {
  const { workload, runIssues } = at;
  const own = runIssues.workloads.get(workload.id) ?? [];
  const steps = mixStepIssues(at);
  const issues = [
    ...own.map((issue) => ownIssue(issue, names)),
    ...steps.map((owned) => stepIssue(owned, names)),
  ];
  const reasons = [
    ...own.map((issue) => workloadIssueText(issue, names)),
    ...groupByIssue(steps, names).map((group) => stepIssueText(group, names)),
  ];
  const canRun = issues.length === 0;
  const summary = canRun
    ? ""
    : `${workload.name} can't run yet: ${reasons.join(" ")}`;
  return { workloadId: workload.id, canRun, issues, reasons, summary };
}

/** The step issues of each workflow in the mix, once each, in mix order. */
function mixStepIssues({ workload, runIssues }: CheckInput): OwnedStepIssue[] {
  const workflowIds = new Set(workload.mix.map((entry) => entry.workflowId));
  return [...workflowIds].flatMap((workflowId) =>
    (runIssues.workflows.get(workflowId) ?? []).map((issue) => ({
      issue,
      workflowId,
    })),
  );
}

function ownIssue(issue: WorkloadIssue, names: RunIssueNames): ValidationIssue {
  return { path: issue.path, message: workloadIssueText(issue, names) };
}

function stepIssue(
  { issue, workflowId }: OwnedStepIssue,
  names: RunIssueNames,
): ValidationIssue {
  const message = stepIssueText({ issue, workflowIds: [workflowId] }, names);
  return { path: issue.path, message };
}

/**
 * The step issues with their workflows, issues that read the same (a call to
 * any removed component) in several steps or workflows grouped as one, in
 * the order first found.
 */
function groupByIssue(
  steps: readonly OwnedStepIssue[],
  names: RunIssueNames,
): StepIssueGroup[] {
  const groups = new Map<string, StepIssueGroup>();
  for (const { issue, workflowId } of steps) {
    const key = stepIssueKey(issue, names);
    const group = groups.get(key) ?? { issue, workflowIds: [] };
    const workflowIds = group.workflowIds.includes(workflowId)
      ? group.workflowIds
      : [...group.workflowIds, workflowId];
    groups.set(key, { ...group, workflowIds });
  }
  return [...groups.values()];
}
