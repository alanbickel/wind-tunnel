import type { Edge, Project, Workflow } from "../../domain/model/project";
import {
  stepLinksOf,
  stepsOfWorkflow,
  type StepLink,
} from "../../domain/model/step-tree";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { Selection, StepSelection } from "./selection";

/** Some of an architecture's components and edges, by id, each once. */
export interface ArchitectureParts {
  readonly componentIds: readonly string[];
  readonly edgeIds: readonly string[];
}

/** What the architecture diagram shows of a selection (UX design §4.1). */
export interface SelectionOnArchitecture {
  /**
   * Marked as the selection: a component, an edge, or a step's component
   * and the edge its call arrives on.
   */
  readonly ringed: ArchitectureParts;
  /**
   * The workflow path: the components and edges a selected workflow uses,
   * or a selected step's workflow; none for any other selection.
   */
  readonly path: ArchitectureParts;
}

const NO_PARTS: ArchitectureParts = { componentIds: [], edgeIds: [] };
const NOTHING_SHOWN: SelectionOnArchitecture = {
  ringed: NO_PARTS,
  path: NO_PARTS,
};

/**
 * What the diagram marks for `selection` in `project`. A step's or a
 * workflow's parts are only those the architecture has: a step whose
 * component is gone rings nothing, and a call with no edge arrives on
 * none. A workflow or step the project doesn't have shows nothing.
 */
export function selectionOnArchitecture(
  project: Project,
  selection: Selection | undefined,
): SelectionOnArchitecture {
  if (selection === undefined) return NOTHING_SHOWN;
  return handleKind(ON_ARCHITECTURE, selection)(project);
}

const ON_ARCHITECTURE: KindHandlers<
  Selection,
  (project: Project) => SelectionOnArchitecture
> = {
  component:
    ({ componentId }) =>
    () => ({
      ringed: { ...NO_PARTS, componentIds: [componentId] },
      path: NO_PARTS,
    }),
  edge:
    ({ edgeId }) =>
    () => ({ ringed: { ...NO_PARTS, edgeIds: [edgeId] }, path: NO_PARTS }),
  workflow:
    ({ workflowId }) =>
    (project) => {
      const workflow = project.workflows.find((w) => w.id === workflowId);
      if (workflow === undefined) return NOTHING_SHOWN;
      return { ringed: NO_PARTS, path: pathOf(project, workflow) };
    },
  step: (selection) => (project) => stepOn(project, selection),
  // A draft isn't on the diagram until it's saved.
  "new-workflow": () => () => NOTHING_SHOWN,
};

/** A step rings its component and the edge its call arrives on, on its workflow's path. */
function stepOn(
  project: Project,
  { workflowId, stepId }: StepSelection,
): SelectionOnArchitecture {
  const workflow = project.workflows.find((w) => w.id === workflowId);
  const step =
    workflow && stepsOfWorkflow(workflow).find((s) => s.id === stepId);
  if (workflow === undefined || step === undefined) return NOTHING_SHOWN;
  // The root step has no caller: the user calls it.
  const arrival = stepLinksOf(workflow).find((l) => l.callee.id === stepId);
  const edge = arrival && edgeAlong(project, arrival);
  return {
    ringed: {
      componentIds: componentsIn(project, [step.componentId]),
      edgeIds: edge === undefined ? [] : [edge.id],
    },
    path: pathOf(project, workflow),
  };
}

/** The components the workflow's steps call, and the edges its calls follow. */
function pathOf(project: Project, workflow: Workflow): ArchitectureParts {
  const called = stepsOfWorkflow(workflow).map((step) => step.componentId);
  const edgeIds = stepLinksOf(workflow)
    .map((link) => edgeAlong(project, link)?.id)
    .filter((id) => id !== undefined);
  return {
    componentIds: componentsIn(project, called),
    edgeIds: [...new Set(edgeIds)],
  };
}

/** The edge a call follows, from its caller's component to its callee's. */
function edgeAlong(project: Project, link: StepLink): Edge | undefined {
  const { caller, callee } = link;
  return project.architecture.edges.find(
    (e) => e.from === caller.componentId && e.to === callee.componentId,
  );
}

/** Those of `ids` the architecture has, each once, in the order given. */
function componentsIn(project: Project, ids: readonly string[]): string[] {
  const present = new Set(project.architecture.components.map((c) => c.id));
  return [...new Set(ids)].filter((id) => present.has(id));
}
