import type { ComponentRegistry } from "../../domain/components/component-registry";
import type { Project, Step } from "../../domain/model/project";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import { componentDetails } from "../details/component-details";
import type {
  Details,
  SettingDetails,
  WorkflowDetails,
} from "../details/details";
import { edgeDetails } from "../details/edge-details";
import type { FieldCatalog } from "../details/field-descriptor";
import { requestSettingDetails } from "../details/request-setting-details";
import { findStep } from "../edits/step-search";
import type { Selection } from "../details/selection";
import { stepDetails } from "../details/step-details";
import { workflowDetails } from "../details/workflow-details";
import { workflowRunChecks } from "../run-checks/workflow-run-checks";
import { workloadRunCheck } from "../run-checks/workload-run-checks";
import { workloadDetails } from "../details/workload-details";

export interface DescribeSelectionDependencies {
  /** Each type's display name and default config, and what a step's issues are checked against. */
  readonly registry: ComponentRegistry;
  /** Each type's setting descriptors. */
  readonly fields: FieldCatalog;
}

/** The selection to describe, in the project it was made in. */
export interface DescribeSelectionInput {
  readonly project: Project;
  readonly selection: Selection;
}

/**
 * What the Details tab shows for a selection (UX design §4.1): for a
 * component or an edge, its settings, with their labels, units, help, and
 * defaults, what an editor needs, and what calls it; an edge's defaults are
 * its caller type's. For a workflow, its outline, each step with its run
 * issues, and the workloads that use it, with its share of each. For a
 * step, its line of that outline, and how a request reaches it.
 * For a workload, its values, its mix with shares, and its profile, each
 * issue on its row. Undefined if the project has no such item, or for a new workflow, which
 * isn't an item yet, or for a finding, which has no Details.
 */
export class DescribeSelection {
  private readonly deps: DescribeSelectionDependencies;

  constructor(deps: DescribeSelectionDependencies) {
    this.deps = deps;
  }

  execute({ project, selection }: DescribeSelectionInput): Details | undefined {
    return handleKind(this.describers(project), selection);
  }

  private describers(
    project: Project,
  ): KindHandlers<Selection, Details | undefined> {
    const { registry } = this.deps;
    return {
      component: ({ componentId }) =>
        this.describeComponent({ project, id: componentId }),
      edge: ({ edgeId }) => this.describeEdge({ project, id: edgeId }),
      workflow: ({ workflowId }) =>
        describeWorkflow({ project, registry, id: workflowId }),
      step: ({ workflowId, stepId }) =>
        describeStep({
          project,
          registry,
          fields: this.deps.fields,
          id: workflowId,
          stepId,
        }),
      workload: ({ workloadId }) =>
        this.describeWorkload({ project, id: workloadId }),
      // A draft has no details to describe: the UI shows it.
      "new-workflow": () => undefined,
      // The run has no Details: the inspector shows its explanation.
      run: () => undefined,
      // A finding has no Details: it marks its component on the diagram.
      finding: () => undefined,
    };
  }

  private describeComponent({ project, id }: ItemInput): Details | undefined {
    const { registry, fields } = this.deps;
    const component = project.architecture.components.find((c) => c.id === id);
    if (component === undefined) return undefined;
    const { type } = component;
    return componentDetails({
      project,
      component,
      type: registry.get(type),
      fields: fields.get(type),
      displayNameOf: (other) => registry.get(other)?.displayName ?? other,
    });
  }

  /** The workload, read-only, with its own issues where they are. */
  private describeWorkload({ project, id }: ItemInput): Details | undefined {
    const workload = project.workloads.find((w) => w.id === id);
    if (workload === undefined) return undefined;
    const { registry } = this.deps;
    const { ownIssues } = workloadRunCheck({ project, registry, workload });
    return workloadDetails({ project, workload, issues: ownIssues });
  }

  /**
   * The edge, with its caller type's edge defaults and their evidence, and
   * its target type's SDK retry defaults.
   */
  private describeEdge({ project, id }: ItemInput): Details | undefined {
    const { registry, fields } = this.deps;
    const { components, edges } = project.architecture;
    const edge = edges.find((e) => e.id === id);
    if (edge === undefined) return undefined;
    const typeOf = (componentId: string) =>
      components.find((c) => c.id === componentId)?.type ?? "";
    const callerType = typeOf(edge.from);
    return edgeDetails({
      project,
      edge,
      defaults: registry.get(callerType)?.edgeDefaults,
      evidence: fields.get(callerType)?.edgeEvidence,
      sdkDefaults: registry.get(typeOf(edge.to))?.sdkRetryDefaults,
    });
  }
}

/** A selected item, by its id, in its project. */
interface ItemInput {
  readonly project: Project;
  readonly id: string;
}

/** A selected workflow, by its id. */
interface WorkflowItemInput extends ItemInput {
  /** What the steps' issues are checked against. */
  readonly registry: ComponentRegistry;
}

/** A selected step, by its id, and its workflow's. */
interface StepItemInput extends WorkflowItemInput {
  readonly stepId: string;
  /** What its request settings mean to a user. */
  readonly fields: FieldCatalog;
}

/**
 * The workflow's outline, with each step's run issues; undefined if the
 * project has no such workflow.
 */
function describeWorkflow(
  input: WorkflowItemInput,
): WorkflowDetails | undefined {
  const { project, registry, id } = input;
  const workflow = project.workflows.find((w) => w.id === id);
  if (workflow === undefined) return undefined;
  const check = workflowRunChecks({ project, registry }).get(id);
  const onSteps = check?.onSteps ?? new Map<string, readonly string[]>();
  return workflowDetails({ project, workflow, onSteps });
}

/**
 * The step's line of its workflow's outline, how a request reaches it, and
 * its request settings; undefined if the project has no such workflow, or
 * it has no such step.
 */
function describeStep(input: StepItemInput): Details | undefined {
  const { project, id, stepId } = input;
  const workflow = project.workflows.find((w) => w.id === id);
  const details = describeWorkflow(input);
  const step = workflow && findStep(workflow, stepId);
  if (workflow === undefined || details === undefined || step === undefined) {
    return undefined;
  }
  const settings = stepSettings({ ...input, step });
  return stepDetails({ project, workflow, details, stepId, settings });
}

/** A step, and the project, types, and descriptors to read its settings by. */
interface StepSettingsInput extends StepItemInput {
  readonly step: Step;
}

/** The step's request settings, read by its component's type. */
function stepSettings(input: StepSettingsInput): SettingDetails[] {
  const { project, registry, fields, step } = input;
  const component = project.architecture.components.find(
    (c) => c.id === step.componentId,
  );
  const typeName = component?.type ?? "";
  return requestSettingDetails({
    step,
    type: registry.get(typeName),
    fields: fields.get(typeName),
  });
}
