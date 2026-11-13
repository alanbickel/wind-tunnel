import type { ComponentRegistry } from "../../domain/components/component-registry";
import type {
  Component,
  Project,
  Step,
  StepAction,
} from "../../domain/model/project";
import { findStep, holderOf } from "../edits/step-search";
import { stepsBelow } from "../../domain/model/step-tree";
import { callChoices, type CallChoice } from "./call-choices";

export interface ChangeStepDependencies {
  /** What actions each type accepts, and its display name. */
  readonly registry: ComponentRegistry;
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
  /** The caller's component name; undefined for the root. */
  readonly callerName: string | undefined;
  /** The components to choose from: the caller's neighbours in edge order, and the step's own if its edge has gone. */
  readonly choices: readonly CallChoice[];
  /** How many steps are under the step, calls and async work and everything nested; a change drops them all. */
  readonly stepsBelow: number;
}

/** The step's label, "orders-db · read"; "a removed component" if the project has none. */
function labelOf(step: Step, component: Component | undefined): string {
  return `${component?.name ?? "a removed component"} · ${step.action}`;
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
 * What a step's pickers start with (UX design §2.5 step 6): its component and
 * action, and the components it can go to. It changes nothing: the step is changed, with
 * `changeStep`, once a component and an action are chosen. Undefined if the
 * step can't be changed (async work, or not in the workflow).
 */
export class ChangeStep {
  private readonly deps: ChangeStepDependencies;

  constructor(deps: ChangeStepDependencies) {
    this.deps = deps;
  }

  execute(input: ChangeStepStartInput): ChangeStepStart | undefined {
    const { registry } = this.deps;
    const { project, workflowId, stepId } = input;
    const workflow = project.workflows.find((w) => w.id === workflowId);
    const step = workflow && findStep(workflow, stepId);
    if (workflow === undefined || step === undefined) return undefined;
    const { components } = project.architecture;
    const caller = componentOf(project, holderOf(workflow, stepId));
    const current = components.find((c) => c.id === step.componentId);
    return {
      componentId: current?.id,
      action: step.action,
      label: labelOf(step, current),
      callerName: caller?.name,
      choices: callChoices({
        registry,
        project,
        caller,
        currentId: current?.id,
      }),
      stepsBelow: stepsBelow(step).length,
    };
  }
}
