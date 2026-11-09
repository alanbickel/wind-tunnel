import type { Project } from "../../domain/model/project";
import { firstFreeName } from "./first-free-name";
import { nameKey } from "./project-name";

/**
 * The name a new workflow starts with: "workflow-1", or the first number
 * no workflow uses, as `checkWorkflowName` compares names (without the
 * spaces around them, ignoring case), so the suggestion always passes it.
 */
export function newWorkflowName(project: Project): string {
  const taken = project.workflows.map((w) => nameKey(w.name));
  return firstFreeName({ prefix: "workflow", taken });
}
