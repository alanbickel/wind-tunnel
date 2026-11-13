import type { Project, Workflow } from "../../domain/model/project";
import { findStep } from "../edits/step-search";
import type { OutlineStep } from "./details";
import { componentName, workflowDetails } from "./workflow-details";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { Selection } from "./selection";

/** Whether a step takes a call, or the async work of an `enqueue` with an empty slot. */
export type OfferedStepKind = "call" | "async";

/** A step an edge's offer could put its call under. */
export interface OfferedStep {
  readonly stepId: string;
  /** Its place in the outline, e.g. "1.1". */
  readonly number: string;
  /** E.g. "fn-orders · invoke". */
  readonly label: string;
  readonly kind: OfferedStepKind;
}

/**
 * What an edge offers while a workflow is selected: to carry a new call
 * (UX design §7, "Add a call by picking its edge").
 */
export interface CallOffer {
  readonly workflowId: string;
  readonly edgeId: string;
  /** The component the edge arrives at, whose actions the call can use. */
  readonly targetId: string;
  /** E.g. "Add a call from fn-orders to orders-db". */
  readonly label: string;
  /** Every step of the workflow on the edge's source that can take the call, in outline order. */
  readonly steps: readonly OfferedStep[];
  /**
   * The step that gets the call without asking: the selected step if it's
   * one of `steps`, else the only one. Undefined when there are several
   * and none is selected, so the offer asks which.
   */
  readonly stepId: string | undefined;
}

/** The workflow a selection is of, or one of whose steps it is; none for any other. */
const WORKFLOW_ID_OF: KindHandlers<Selection, string | undefined> = {
  workflow: ({ workflowId }) => workflowId,
  step: ({ workflowId }) => workflowId,
  component: () => undefined,
  edge: () => undefined,
  workload: () => undefined,
  "new-workflow": () => undefined,
  finding: () => undefined,
};

/** The selected step's id, or undefined for any other selection. */
const SELECTED_STEP_ID_OF: KindHandlers<Selection, string | undefined> = {
  ...WORKFLOW_ID_OF,
  workflow: () => undefined,
  step: ({ stepId }) => stepId,
};

/**
 * The edges that offer to carry a new call while a workflow, or one of its
 * steps, is selected: each edge leaving a component some step of the
 * workflow can take a call under, in architecture order. That includes
 * edges the path already uses, since a step can call the same component
 * twice. A step takes a call as the outline's "Add a call from …" does: not
 * an `enqueue`, whose follow-up work is its async work, and not a step
 * whose component is gone. An `enqueue` with an empty async slot takes the
 * async work along its edge; one with the slot filled offers nothing. No
 * other selection offers anything, and an offer adds no edge.
 */
export function callOffersOf(
  project: Project,
  selection: Selection | undefined,
): CallOffer[] {
  if (selection === undefined) return [];
  const workflowId = handleKind(WORKFLOW_ID_OF, selection);
  const workflow = project.workflows.find((w) => w.id === workflowId);
  if (workflow === undefined) return [];
  const selectedId = handleKind(SELECTED_STEP_ID_OF, selection);
  return project.architecture.edges.flatMap((edge) => {
    const steps = takingStepsOn({ project, workflow, componentId: edge.from });
    if (steps.length === 0) return [];
    return [
      {
        workflowId: workflow.id,
        edgeId: edge.id,
        targetId: edge.to,
        label: labelOf(project, { from: edge.from, to: edge.to, steps }),
        steps: steps.map(({ step }) => step),
        stepId: chosenStepId(steps, selectedId),
      },
    ];
  });
}

/** An offered step, and the id of its component. */
interface TakingStep {
  readonly step: OfferedStep;
  readonly componentId: string;
}

/** The workflow's steps on one component that can take a call, in outline order. */
interface TakingStepsInput {
  readonly project: Project;
  readonly workflow: Workflow;
  readonly componentId: string;
}

function takingStepsOn({
  project,
  workflow,
  componentId,
}: TakingStepsInput): TakingStep[] {
  const { outline } = workflowDetails({
    project,
    workflow,
    onSteps: new Map(),
    currentStepId: undefined,
  });
  return outlineSteps(outline)
    .flatMap((outlined) => takingStep(workflow, outlined))
    .filter((taking) => taking.componentId === componentId);
}

/** The step and every step under it, in outline order: calls, then async work. */
function outlineSteps(step: OutlineStep): OutlineStep[] {
  const under = [...step.calls, ...(step.async ? [step.async] : [])];
  return [step, ...under.flatMap(outlineSteps)];
}

/** The step as an offered one, or nothing if it can't take a call. */
function takingStep(workflow: Workflow, outlined: OutlineStep): TakingStep[] {
  const kind = kindOf(outlined);
  const step = findStep(workflow, outlined.stepId);
  if (kind === undefined || step === undefined) return [];
  const { stepId, number, label } = outlined;
  return [
    { step: { stepId, number, label, kind }, componentId: step.componentId },
  ];
}

/** What the outline offers the step: a call, async work, or neither. */
function kindOf(outlined: OutlineStep): OfferedStepKind | undefined {
  if (outlined.addCallLabel !== undefined) return "call";
  if (outlined.asyncSlot !== undefined) return "async";
  return undefined;
}

/** The selected step if it's among `steps`, else the only one, else none. */
function chosenStepId(
  steps: readonly TakingStep[],
  selectedId: string | undefined,
): string | undefined {
  const selected = steps.find(({ step }) => step.stepId === selectedId);
  if (selected !== undefined) return selected.step.stepId;
  return steps.length === 1 ? steps[0]?.step.stepId : undefined;
}

/** The two components an offer joins, and the steps it could go under. */
interface LabelInput {
  readonly from: string;
  readonly to: string;
  readonly steps: readonly TakingStep[];
}

/** "Add a call from fn-orders to orders-db", or "Add async work from …" for a queue's slot. */
function labelOf(project: Project, { from, to, steps }: LabelInput): string {
  const between = `${componentName(project, from)} to ${componentName(project, to)}`;
  const async = steps.every(({ step }) => step.kind === "async");
  return async
    ? `Add async work from ${between}`
    : `Add a call from ${between}`;
}
