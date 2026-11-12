import type { ComponentRegistry } from "../../domain/components/component-registry";
import { findRunIssues } from "../../domain/components/find-run-issues";
import type { Project } from "../../domain/model/project";
import type { StepIssue } from "../../domain/model/run-issue";
import { stepAt } from "../../domain/model/step-tree";
import type { IssuePath } from "../../domain/model/validation-issue";
import { lookup } from "../../domain/shared/kind-handlers";
import { problemCount } from "./problem-count";
import {
  runIssueNames,
  stepIssueOnStep,
  type RunIssueNames,
} from "./run-issue-phrases";

/** A workflow's run issues, as the workflows list and its outline show them. */
export interface WorkflowRunCheck {
  readonly workflowId: string;
  /** "1 problem", "2 problems": one per step issue; undefined for none. */
  readonly problems: string | undefined;
  /**
   * Each step's issues as sentences, by step ID, for the step's line in the
   * outline: "This step calls a component that isn't in the architecture
   * any more." A step without issues has no entry.
   */
  readonly onSteps: ReadonlyMap<string, readonly string[]>;
}

/** Each workflow's check, by workflow ID. */
export type WorkflowRunChecks = ReadonlyMap<string, WorkflowRunCheck>;

export interface WorkflowRunChecksInput {
  /** A project whose architecture is valid, as every opened project's is. */
  readonly project: Project;
  readonly registry: ComponentRegistry;
}

/**
 * Each of the project's workflows' run issues, each on the step its path
 * leads to (UX design §2.5 step 7).
 */
export function workflowRunChecks({
  project,
  registry,
}: WorkflowRunChecksInput): WorkflowRunChecks {
  const { workflows } = findRunIssues(project, registry);
  const names = runIssueNames(project, registry);
  return new Map(
    project.workflows.map(({ id }) => {
      const issues = workflows.get(id) ?? [];
      const check = checkOf({ project, issues }, names);
      return [id, { workflowId: id, ...check }];
    }),
  );
}

/** One workflow's step issues, in the project they're in. */
interface IssuesInput {
  readonly project: Project;
  readonly issues: readonly StepIssue[];
}

function checkOf(
  { project, issues }: IssuesInput,
  names: RunIssueNames,
): Omit<WorkflowRunCheck, "workflowId"> {
  const onSteps = new Map<string, string[]>();
  for (const issue of issues) {
    const stepId = stepAt(project, stepPathOf(issue))?.id;
    if (stepId === undefined) continue;
    const said = onSteps.get(stepId) ?? [];
    onSteps.set(stepId, [...said, stepIssueOnStep(issue, names)]);
  }
  return { problems: problemCount(issues.length), onSteps };
}

/**
 * The path to the step an issue is on. Most issues' paths go on into a
 * field of the step, which `stepAt` stops at; but a path that ends in
 * `async` would lead it on into the async work, so an issue about the
 * step's own `async` drops it. A missing edge's path is to the step called.
 */
function stepPathOf(issue: StepIssue): IssuePath {
  return lookup(STEP_PATHS, issue.kind)(issue.path);
}

const toStep = (path: IssuePath) => path;
const toField = (path: IssuePath) => path.slice(0, -1);

const STEP_PATHS: Record<StepIssue["kind"], (path: IssuePath) => IssuePath> = {
  "unknown-component": toField,
  "missing-edge": toStep,
  "action-not-accepted": toField,
  "async-not-on-enqueue": toField,
  "async-not-delivered": toField,
};
