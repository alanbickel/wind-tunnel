/** The components a new call joins, and whether it adds an edge between them. */
export interface AddCallTextInput {
  readonly callerName: string;
  readonly calleeName: string;
  /** True when the caller has no edge to the callee yet. */
  readonly addsEdge: boolean;
}

/** What a new call is named for Undo, and what is announced when it's saved. */
export interface AddCallText {
  /** E.g. "Add a call from api to fn-orders, and its edge". */
  readonly undoName: string;
  /** E.g. "Added the edge from api to fn-orders." */
  readonly announcement: string;
}

/**
 * The words for adding a call (UX design §2.5 steps 3 and 5, §4.4). A call
 * along a missing edge adds the edge too, which appears on the diagram away
 * from the focus, so the announcement says so, and Undo's name names both.
 */
export function addCallText({
  callerName,
  calleeName,
  addsEdge,
}: AddCallTextInput): AddCallText {
  const between = `${callerName} to ${calleeName}`;
  const undoName = `Add a call from ${between}`;
  if (!addsEdge) {
    return { undoName, announcement: `Added a call from ${between}.` };
  }
  return {
    undoName: `${undoName}, and its edge`,
    announcement: `Added a call from ${between}. Added the edge from ${between}.`,
  };
}

/** What a choice of the callee's picker says when choosing it adds an edge. */
export function newEdgeNote(callerName: string): string {
  return `No edge from ${callerName} yet; choosing it adds one.`;
}
