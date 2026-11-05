import type { Project, Step, Workflow } from "../../domain/model/project";
import { componentName } from "./workflow-details";

/**
 * The paths a workflow's requests take, as the diagram's text version reads
 * them: "Get order: api → fn-orders → orders-db (read)." A step is named by
 * its component and, at the end of a path, its action; never by an id. A
 * workflow that branches gives one path per leaf, separated by semicolons,
 * and an `enqueue`'s async work follows it after "then": "… → orders-queue
 * (enqueue), then fn-writer → orders-db (write)."
 */
export function workflowPathText(project: Project, workflow: Workflow): string {
  return `${workflow.name}: ${pathsFrom(project, workflow.root).join("; ")}.`;
}

/**
 * Each path from the step to a leaf: through each of its calls in order,
 * then on into its async work. A step with neither ends a path, with its
 * action.
 */
function pathsFrom(project: Project, step: Step): string[] {
  const name = componentName(project, step.componentId);
  const ended = `${name} (${step.action})`;
  const viaCalls = (step.calls ?? []).flatMap((call) =>
    pathsFrom(project, call).map((rest) => `${name} → ${rest}`),
  );
  const viaAsync = step.async
    ? pathsFrom(project, step.async).map((rest) => `${ended}, then ${rest}`)
    : [];
  const paths = [...viaCalls, ...viaAsync];
  return paths.length === 0 ? [ended] : paths;
}
