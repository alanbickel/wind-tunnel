import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import type { ConnectComponentsInput } from "../edits/edge-edits";
import type { IdGenerator } from "../ports/id-generator";

export interface NewEdgeDependencies {
  /** Each type's edge defaults. */
  readonly registry: ComponentRegistry;
  /** The new edge's id. */
  readonly ids: IdGenerator;
}

/** The components to connect, in the project they're in. */
export interface NewEdgeInput {
  readonly project: Project;
  /** The caller's component id. */
  readonly from: string;
  /** The callee's component id. */
  readonly to: string;
}

/**
 * What `connectComponents` needs to connect two components: a new id and
 * the caller type's edge defaults (UX design §5). Undefined if the project
 * has no such caller, or the registry no such type. A new type registered
 * with its `edgeDefaults` needs no change here.
 */
export class NewEdge {
  private readonly deps: NewEdgeDependencies;

  constructor(deps: NewEdgeDependencies) {
    this.deps = deps;
  }

  execute({
    project,
    from,
    to,
  }: NewEdgeInput): ConnectComponentsInput | undefined {
    const { registry, ids } = this.deps;
    const caller = project.architecture.components.find((c) => c.id === from);
    const type = caller && registry.get(caller.type);
    if (type === undefined) return undefined;
    return { edgeId: ids.newId(), from, to, settings: type.edgeDefaults };
  }
}
