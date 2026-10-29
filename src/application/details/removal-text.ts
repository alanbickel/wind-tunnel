import type { Component, Edge, Project } from "../../domain/model/project";
import { listOf } from "../shared/list-of";
import { stepsCalling } from "./called-by";
import type { RemovalText } from "./details";

/**
 * What removing a component would take, as Remove's confirmation asks it
 * (UX design §2.4 steps 4 and 5): its edges, by the components at their
 * other ends, and how many workflow steps call it, which stay.
 */
export function removalText(
  project: Project,
  component: Component,
): RemovalText {
  const ends = project.architecture.edges.flatMap((edge) =>
    otherEnd({ project, edge, componentId: component.id }),
  );
  return {
    question: `Remove ${component.name}${edgesPhrase(ends)}?`,
    warning: callersWarning(stepsCalling(project, component.id)),
  };
}

/** " and its edge from Function", or nothing if it has no edges. */
function edgesPhrase(ends: readonly string[]): string {
  if (ends.length === 0) return "";
  const noun = ends.length === 1 ? "edge" : "edges";
  return ` and its ${noun} ${listOf(ends)}`;
}

interface OtherEndInput {
  readonly project: Project;
  readonly edge: Edge;
  readonly componentId: string;
}

/**
 * "from fn-orders" or "to orders-db": the edge's other end, if it's one of
 * the component's own edges.
 */
function otherEnd({ project, edge, componentId }: OtherEndInput): string[] {
  const name = (id: string) =>
    project.architecture.components.find((c) => c.id === id)?.name ?? id;
  if (edge.to === componentId) return [`from ${name(edge.from)}`];
  if (edge.from === componentId) return [`to ${name(edge.to)}`];
  return [];
}

/** That the steps calling it stay, and won't run; undefined if none does. */
function callersWarning(steps: number): string | undefined {
  if (steps === 0) return undefined;
  if (steps === 1) {
    return "1 workflow step calls it, and won't run until you change it.";
  }
  return `${String(steps)} workflow steps call it, and won't run until you change them.`;
}
