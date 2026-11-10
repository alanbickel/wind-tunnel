import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { EdgeSettings } from "../../domain/model/edge-settings";
import type {
  Component,
  Project,
  Step,
  StepAction,
} from "../../domain/model/project";
import { ASYNC_ACTION_LOCKED } from "../details/change-step-text";
import { holderOf, stepInCalls } from "../edits/workflow-edits";
import type { IdGenerator } from "../ports/id-generator";
import {
  callChoices,
  type CallChoice,
  type CallChoicesInput,
} from "./call-choices";

export interface ChangeStepDependencies {
  /** What actions each type accepts, its display name, and its edge defaults. */
  readonly registry: ComponentRegistry;
  /** The id of the edge a change along a missing one adds. */
  readonly ids: IdGenerator;
}

/** The step to change, in its workflow and project. */
export interface ChangeStepStartInput {
  readonly project: Project;
  readonly workflowId: string;
  readonly stepId: string;
}

/** What the UI needs to offer a step's pickers, and to save a change. */
export interface ChangeStepStart {
  /** The step's component now; undefined if the project no longer has it. */
  readonly componentId: string | undefined;
  readonly action: StepAction;
  /** The step's label now: "fn-orders · invoke". */
  readonly label: string;
  /** The id of the edge a change along a missing one adds. */
  readonly edgeId: string;
  /** The caller type's edge defaults, for that edge; undefined for the root, which adds none. */
  readonly edgeSettings: EdgeSettings | undefined;
  /** The caller's component name; undefined for the root. */
  readonly callerName: string | undefined;
  /** The components to choose from: the caller's neighbours first; with async work, only those whose type accepts the step's action. */
  readonly choices: readonly CallChoice[];
  /** Why the action can't change; undefined when it can. */
  readonly actionLocked: string | undefined;
}

/** The step's label, "orders-db · read"; "a removed component" if the project has none. */
function labelOf(step: Step, component: Component | undefined): string {
  return `${component?.name ?? "a removed component"} · ${step.action}`;
}

/** What the caller's type gives a new edge from it; undefined without a caller or a known type. */
function edgeDefaultsOf(
  registry: ComponentRegistry,
  caller: Component | undefined,
): EdgeSettings | undefined {
  return caller && registry.get(caller.type)?.edgeDefaults;
}

/** The component a step calls, if it's a step and the project has it. */
function componentOf(
  project: Project,
  step: Step | undefined,
): Component | undefined {
  return project.architecture.components.find(
    (c) => c.id === step?.componentId,
  );
}

/**
 * The components a step can be changed to. With async work, only those whose
 * type accepts its action, since the action can't change while it has it.
 */
function choicesFor(input: CallChoicesInput, step: Step): CallChoice[] {
  const choices = callChoices(input);
  if (step.async === undefined) return choices;
  return choices.filter((c) => c.actions.includes(step.action));
}

/**
 * What a step's pickers start with (UX design §2.5 step 6): its component and
 * action, the components it can go to, and the edge a change along a
 * missing one would add. It changes nothing: the step is changed, with
 * `changeStep`, once a component and an action are chosen. Undefined if the
 * step can't be changed (async work, or not in the workflow).
 */
export class ChangeStep {
  private readonly deps: ChangeStepDependencies;

  constructor(deps: ChangeStepDependencies) {
    this.deps = deps;
  }

  execute(input: ChangeStepStartInput): ChangeStepStart | undefined {
    const { registry, ids } = this.deps;
    const { project, workflowId, stepId } = input;
    const workflow = project.workflows.find((w) => w.id === workflowId);
    const step = workflow && stepInCalls(workflow, stepId);
    if (workflow === undefined || step === undefined) return undefined;
    const { components } = project.architecture;
    const caller = componentOf(project, holderOf(workflow, stepId));
    const current = components.find((c) => c.id === step.componentId);
    return {
      componentId: current?.id,
      action: step.action,
      label: labelOf(step, current),
      edgeId: ids.newId(),
      edgeSettings: edgeDefaultsOf(registry, caller),
      callerName: caller?.name,
      choices: choicesFor({ registry, project, caller }, step),
      actionLocked: step.async && ASYNC_ACTION_LOCKED,
    };
  }
}
