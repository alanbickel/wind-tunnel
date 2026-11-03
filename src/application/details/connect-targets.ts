import type { Project } from "../../domain/model/project";
import type { ConnectTarget } from "./details";

/** A component, in its project, and how to name a type. */
export interface ConnectTargetsInput {
  readonly project: Project;
  readonly componentId: string;
  /** A type's display name, e.g. "RDS" for `"rds"`. */
  readonly displayNameOf: (type: string) => string;
}

/**
 * The components "Connect to…" offers a component (UX design §2.1 step
 * 5): every other one it has no edge to yet, in project order. Neither
 * itself nor one it already reaches is offered, so the picker can't make
 * an edge the architecture refuses.
 */
export function connectTargets({
  project,
  componentId,
  displayNameOf,
}: ConnectTargetsInput): ConnectTarget[] {
  const { components, edges } = project.architecture;
  const reached = new Set(
    edges.filter((e) => e.from === componentId).map((e) => e.to),
  );
  return components
    .filter((c) => c.id !== componentId && !reached.has(c.id))
    .map((c) => ({
      componentId: c.id,
      label: `${c.name} (${displayNameOf(c.type)})`,
    }));
}
