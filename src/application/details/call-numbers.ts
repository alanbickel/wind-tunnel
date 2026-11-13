import type { Project, Workflow } from "../../domain/model/project";
import { stepLinksOf } from "../../domain/model/step-tree";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { Selection } from "./selection";
import { edgeAlong } from "./selection-on-architecture";

/** The numbers of the calls that follow one edge, in the order they're made. */
export interface EdgeCallNumbers {
  readonly edgeId: string;
  readonly numbers: readonly number[];
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

/**
 * The calls of the selected workflow, or of a selected step's, numbered from
 * 1 in the order a request makes them: each step's calls in turn, each call's
 * own calls before the next, and a step's async work last. Async work's
 * calls carry on from the main tree's numbers. A number belongs to the edge
 * its call follows, so an edge several calls share lists each; the root step
 * has no call, since the user makes it, and a call with no edge has no mark.
 * Edges come in the order of their first call.
 */
export function callNumbersOf(
  project: Project,
  selection: Selection | undefined,
): EdgeCallNumbers[] {
  if (selection === undefined) return [];
  const workflowId = handleKind(WORKFLOW_ID_OF, selection);
  const workflow = project.workflows.find((w) => w.id === workflowId);
  return workflow === undefined ? [] : numbersOn(project, workflow);
}

function numbersOn(project: Project, workflow: Workflow): EdgeCallNumbers[] {
  const byEdge = new Map<string, number[]>();
  stepLinksOf(workflow).forEach((link, index) => {
    const edge = edgeAlong(project, link);
    if (edge === undefined) return;
    byEdge.set(edge.id, [...(byEdge.get(edge.id) ?? []), index + 1]);
  });
  return [...byEdge].map(([edgeId, numbers]) => ({ edgeId, numbers }));
}
