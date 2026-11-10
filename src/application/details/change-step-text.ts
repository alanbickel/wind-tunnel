/** A step's old and new label, and whether the change adds an edge. */
export interface ChangeStepTextInput {
  /** The step's label before: "fn-orders · invoke". */
  readonly fromLabel: string;
  /** Its label after: "orders-db · read". */
  readonly toLabel: string;
  /** The caller's name and the new component's, when the change adds an edge; undefined when it doesn't. */
  readonly edge: EdgeEnds | undefined;
}

/** The two components an edge joins, by name. */
export interface EdgeEnds {
  readonly callerName: string;
  readonly calleeName: string;
}

/** What a step's change is named for Undo, and what is announced when it's saved. */
export interface ChangeStepText {
  /** E.g. "Change fn-orders · invoke to orders-db · read". */
  readonly undoName: string;
  /** E.g. "Changed fn-orders · invoke to orders-db · read." */
  readonly announcement: string;
}

/**
 * The words for changing a step (UX design §2.5 step 6, §4.4). A change
 * along a missing edge adds the edge too, which appears on the diagram away
 * from the focus, so the announcement says so, and Undo's name names both.
 */
export function changeStepText({
  fromLabel,
  toLabel,
  edge,
}: ChangeStepTextInput): ChangeStepText {
  const undoName = `Change ${fromLabel} to ${toLabel}`;
  const announcement = `Changed ${fromLabel} to ${toLabel}.`;
  if (edge === undefined) return { undoName, announcement };
  return {
    undoName: `${undoName}, and its edge`,
    announcement: `${announcement} Added the edge from ${edge.callerName} to ${edge.calleeName}.`,
  };
}

/** What a step with async work says in place of an action it can't change yet. */
export const ASYNC_ACTION_LOCKED =
  "Remove its async work first, or wait for the async-work editor.";
