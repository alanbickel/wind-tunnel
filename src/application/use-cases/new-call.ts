import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project } from "../../domain/model/project";
import { callChoices, type CallChoice } from "./call-choices";
import { findStep } from "../edits/step-search";
import type { IdGenerator } from "../ports/id-generator";

export interface NewCallDependencies {
  /** What actions each type accepts, and its display name. */
  readonly registry: ComponentRegistry;
  /** The new call's id. */
  readonly ids: IdGenerator;
}

/** The step that gets a new call, in its workflow and project. */
export interface NewCallInput {
  readonly project: Project;
  readonly workflowId: string;
  /** The caller step's id. */
  readonly stepId: string;
}

/** What the UI needs to draft a call, and to add it once it's complete. */
export interface NewCallStart {
  readonly callId: string;
  /** The caller's component name. */
  readonly callerName: string;
  /** The components the caller has an edge to, in edge order; empty if it has none. */
  readonly choices: readonly CallChoice[];
}

/**
 * What a new call starts with (UX design §2.5 steps 3 and 5): its id and
 * the components it can go to, which are the ones the caller has an edge to
 * (a call never adds one). It changes nothing: the call is added, with
 * `addCall`, once the component and the action are chosen. Undefined if the
 * step can't take a call, or its component or type isn't known.
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
    const step = workflow && findStep(workflow, stepId);
    const caller = project.architecture.components.find(
      (c) => c.id === step?.componentId,
    );
    const callerType = caller && registry.get(caller.type);
    if (caller === undefined || callerType === undefined) return undefined;
    return {
      callId: ids.newId(),
      callerName: caller.name,
      choices: callChoices({ registry, project, caller }),
    };
  }
}
