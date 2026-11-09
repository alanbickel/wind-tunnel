import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { EdgeSettings } from "../../domain/model/edge-settings";
import type {
  Component,
  Project,
  StepAction,
} from "../../domain/model/project";
import { newEdgeNote } from "../details/add-call-text";
import { stepInCalls } from "../edits/workflow-edits";
import type { IdGenerator } from "../ports/id-generator";

export interface NewCallDependencies {
  /** What actions each type accepts, its display name, and its edge defaults. */
  readonly registry: ComponentRegistry;
  /** The new call's id, and its edge's. */
  readonly ids: IdGenerator;
}

/** The step that gets a new call, in its workflow and project. */
export interface NewCallInput {
  readonly project: Project;
  readonly workflowId: string;
  /** The caller step's id. */
  readonly stepId: string;
}

/** A component a new call can go to. */
export interface CallChoice {
  readonly componentId: string;
  /** Its name, as Undo and the announcements say it. */
  readonly name: string;
  /** E.g. "orders-db (RDS)": its name, then its type's display name. */
  readonly label: string;
  /** What its type accepts, in the type's order; empty for an unknown type. */
  readonly actions: readonly StepAction[];
  /** True when the caller has no edge to it, so choosing it adds one. */
  readonly addsEdge: boolean;
  /** What marks a choice that adds an edge; undefined for a neighbour. */
  readonly note: string | undefined;
}

/** What the UI needs to draft a call, and to add it once it's complete. */
export interface NewCallStart {
  readonly callId: string;
  /** The id of the edge a call along a missing one adds. */
  readonly edgeId: string;
  /** The caller type's edge defaults, for that edge. */
  readonly edgeSettings: EdgeSettings;
  /** The caller's component name. */
  readonly callerName: string;
  /** The caller's neighbours first, then the rest; never the caller's own component. */
  readonly choices: readonly CallChoice[];
}

/**
 * What a new call starts with (UX design §2.5 steps 3 and 5): its ids, the
 * caller type's edge defaults, and the components it can go to, the ones
 * the caller has an edge to first. It changes nothing: the call is added,
 * with `addCall`, once the component and the action are chosen. Undefined
 * if the step can't take a call, or its component or type isn't known.
 */
export class NewCall {
  private readonly deps: NewCallDependencies;

  constructor(deps: NewCallDependencies) {
    this.deps = deps;
  }

  execute(input: NewCallInput): NewCallStart | undefined {
    const { registry, ids } = this.deps;
    const { project, workflowId, stepId } = input;
    const workflow = project.workflows.find((w) => w.id === workflowId);
    const step = workflow && stepInCalls(workflow, stepId);
    const caller = project.architecture.components.find(
      (c) => c.id === step?.componentId,
    );
    const callerType = caller && registry.get(caller.type);
    if (caller === undefined || callerType === undefined) return undefined;
    return {
      callId: ids.newId(),
      edgeId: ids.newId(),
      edgeSettings: callerType.edgeDefaults,
      callerName: caller.name,
      choices: this.choicesFor(project, caller),
    };
  }

  /** Every other component, the caller's neighbours first, each group in project order. */
  private choicesFor(project: Project, caller: Component): CallChoice[] {
    const { components, edges } = project.architecture;
    const reached = new Set(
      edges.filter((e) => e.from === caller.id).map((e) => e.to),
    );
    const choices = components
      .filter((c) => c.id !== caller.id)
      .map((c) =>
        this.choiceOf(c, {
          callerName: caller.name,
          addsEdge: !reached.has(c.id),
        }),
      );
    // Array.sort is stable: false (neighbours) sorts before true.
    return choices.sort((a, b) => Number(a.addsEdge) - Number(b.addsEdge));
  }

  private choiceOf(component: Component, edge: EdgeNeed): CallChoice {
    const type = this.deps.registry.get(component.type);
    const { callerName, addsEdge } = edge;
    return {
      componentId: component.id,
      name: component.name,
      label: `${component.name} (${type?.displayName ?? component.type})`,
      actions: type?.actions ?? [],
      addsEdge,
      note: addsEdge ? newEdgeNote(callerName) : undefined,
    };
  }
}

/** Whether a choice needs a new edge from the caller, and the caller's name. */
interface EdgeNeed {
  readonly callerName: string;
  readonly addsEdge: boolean;
}
