import type { Project } from "../../domain/model/project";
import type { DraftCheck } from "./number-draft";
import { nameKey } from "./project-name";

/** A workflow's name field: what's typed, and where the workflow is. */
export interface WorkflowNameInput {
  readonly project: Project;
  /** The workflow being named, whose own name doesn't count against it. */
  readonly workflowId: string;
  /** What's typed. Spaces around it are dropped. */
  readonly text: string;
}

/** What a workflow's name field says when another workflow uses the name. */
export const WORKFLOW_NAME_TAKEN =
  "Another workflow already uses this name. Please choose another name.";

/**
 * A workflow's new name, checked: not empty, and not used by another
 * workflow of the project (UX design §2.5, §5). Names are compared without
 * the spaces around them and ignoring case, as project names are, so
 * "get order" can become "Get order". Workflows already stored with the
 * same name keep it.
 */
export function checkWorkflowName({
  project,
  workflowId,
  text,
}: WorkflowNameInput): DraftCheck<string> {
  const name = text.trim();
  if (name === "") {
    return { status: "fails", message: "A workflow needs a name." };
  }
  const key = nameKey(name);
  const taken = project.workflows.some(
    (w) => w.id !== workflowId && nameKey(w.name) === key,
  );
  if (!taken) return { status: "passes", value: name };
  return { status: "fails", message: WORKFLOW_NAME_TAKEN };
}
