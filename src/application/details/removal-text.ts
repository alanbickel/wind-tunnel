import type { Component, Edge, Project } from "../../domain/model/project";
import { listOf } from "../shared/list-of";
import { stepsCalling, stepsCallingAlong } from "./called-by";
import type { RemovalText } from "./details";
import { nameOf } from "./name-of";

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
    warning: callersWarning({
      steps: stepsCalling(project, component.id),
      call: "it",
    }),
  };
}

/**
 * What removing an edge would take, as Remove's confirmation asks it: the
 * edge, by the components it joins, and how many workflow steps call along
 * it, which stay (UX design §4.3).
 */
export function edgeRemovalText(project: Project, edge: Edge): RemovalText {
  const name = (id: string) => nameOf(project, id);
  return {
    question: `Remove the edge from ${name(edge.from)} to ${name(edge.to)}?`,
    warning: callersWarning({
      steps: stepsCallingAlong(project, edge),
      call: "along it",
    }),
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
  const name = (id: string) => nameOf(project, id);
  if (edge.to === componentId) return [`from ${name(edge.from)}`];
  if (edge.from === componentId) return [`to ${name(edge.to)}`];
  return [];
}

/** The steps that call a component or along an edge, and how they call. */
interface CallersWarningInput {
  readonly steps: number;
  /** What the steps call: "it", a component, or "along it", an edge. */
  readonly call: string;
}

/** That the steps calling it stay, and won't run; undefined if none does. */
function callersWarning({
  steps,
  call,
}: CallersWarningInput): string | undefined {
  if (steps === 0) return undefined;
  if (steps === 1) {
    return `1 workflow step calls ${call}, and won't run until you change it.`;
  }
  return `${String(steps)} workflow steps call ${call}, and won't run until you change them.`;
}
