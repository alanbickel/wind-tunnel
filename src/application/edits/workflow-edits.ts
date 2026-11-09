import type { Workflow } from "../../domain/model/project";
import type { ProjectRecord } from "../ports/project-record";

// Edit commands (ADR-0019): each takes the project record and returns the
// next one, doing the whole change, so it's one undo step. They don't
// check the change: a field checks its draft first, and `SaveProject`
// checks the record it saves. A command for a workflow the project
// doesn't have returns the record unchanged.

/** A workflow, and its new name. */
export interface RenameWorkflowInput {
  readonly workflowId: string;
  readonly name: string;
}

/**
 * Renames a workflow. Workloads' mixes refer to it by id, so nothing else
 * changes. The same name returns the record as it was.
 */
export function renameWorkflow(
  record: ProjectRecord,
  { workflowId, name }: RenameWorkflowInput,
): ProjectRecord {
  const { project } = record;
  const found = project.workflows.find((w) => w.id === workflowId);
  if (found === undefined || found.name === name) return record;
  const rename = (w: Workflow): Workflow =>
    w.id === workflowId ? { ...w, name } : w;
  return {
    ...record,
    project: { ...project, workflows: project.workflows.map(rename) },
  };
}
