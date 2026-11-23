import type { Project, Step, Workflow } from "../../domain/model/project";
import { stepLinksOf, type StepLink } from "../../domain/model/step-tree";
import type { SettingDetails, StepDetails, WorkflowDetails } from "./details";
import { componentName, outlineSteps } from "./workflow-details";

/** A step, by its id, in its workflow and that workflow's details. */
export interface StepDetailsInput {
  readonly project: Project;
  readonly workflow: Workflow;
  /** The workflow's details, whose outline has the step's line. */
  readonly details: WorkflowDetails;
  readonly stepId: string;
  /** Its request settings, as `requestSettingDetails` reads them. */
  readonly settings: readonly SettingDetails[];
}

/**
 * A step on its own (UX design §5): its outline line, the workflow it's
 * in, how a request reaches it, along which edge, and its request
 * settings. Undefined if the workflow has no step with that id.
 */
export function stepDetails(input: StepDetailsInput): StepDetails | undefined {
  const { project, workflow, details, stepId, settings } = input;
  const step = outlineSteps(details.outline).find((s) => s.stepId === stepId);
  if (step === undefined) return undefined;
  const link = stepLinksOf(workflow).find((l) => l.callee.id === stepId);
  const arrival =
    link === undefined
      ? firstArrival(workflow)
      : linkArrival({ project, link });
  return {
    kind: "step",
    workflowId: workflow.id,
    workflowName: workflow.name,
    step,
    ...arrival,
    settings,
  };
}

/** How a request reaches a step, and the edge it arrives on. */
type Arrival = Pick<StepDetails, "arrival" | "edgeId">;

/** The first step's: the user calls it, along no edge. */
function firstArrival(workflow: Workflow): Arrival {
  return {
    arrival: `The first step: each request of ${workflow.name} starts here.`,
    edgeId: undefined,
  };
}

/** A step its caller calls, and the project it's in. */
interface LinkArrivalInput {
  readonly project: Project;
  readonly link: StepLink;
}

/**
 * A called step's: who calls it, a call or a queue's delivery of its async
 * work, and the edge from the caller's component to its own, or that
 * there's none.
 */
function linkArrival({ project, link }: LinkArrivalInput): Arrival {
  const { caller, callee } = link;
  const name = (step: Step) => componentName(project, step.componentId);
  const verb = caller.async === callee ? "Delivered by" : "Called by";
  const edge = project.architecture.edges.find(
    (e) => e.from === caller.componentId && e.to === callee.componentId,
  );
  const along =
    edge === undefined
      ? `but ${name(caller)} has no edge to ${name(callee)}`
      : `along ${name(caller)} → ${name(callee)}`;
  return {
    arrival: `${verb} ${name(caller)} · ${caller.action}, ${along}.`,
    edgeId: edge?.id,
  };
}
