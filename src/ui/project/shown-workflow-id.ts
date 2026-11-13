import type { Selection } from "../../application/details/selection";
import type { KindHandlers } from "../../domain/shared/kind-handlers";
import { dispatchKind } from "../shared/kind-dispatch";

/** The workflow whose outline Details shows for each kind of selection. */
const SHOWN_WORKFLOW: KindHandlers<Selection, string | undefined> = {
  component: () => undefined,
  edge: () => undefined,
  workflow: ({ workflowId }) => workflowId,
  step: ({ workflowId }) => workflowId,
  workload: () => undefined,
  "new-workflow": () => undefined,
  finding: () => undefined,
};

/**
 * The workflow Details outlines for the selection, if any: the one selected,
 * or the one a selected step is in. The workflow list and the picker both
 * mark it.
 */
export function shownWorkflowId(
  selection: Selection | undefined,
): string | undefined {
  return selection && dispatchKind(SHOWN_WORKFLOW, selection);
}
