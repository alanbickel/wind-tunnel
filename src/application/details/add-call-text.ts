/** The components a new call joins. */
export interface AddCallTextInput {
  readonly callerName: string;
  readonly calleeName: string;
}

/** What a new call is named for Undo, and what is announced when it's saved. */
export interface AddCallText {
  /** E.g. "Add a call from api to fn-orders". */
  readonly undoName: string;
  /** E.g. "Added a call from api to fn-orders." */
  readonly announcement: string;
}

/**
 * The words for adding a call (UX design §2.5 steps 3 and 5, §4.4). A call
 * goes along an existing edge, so the words name the call alone.
 */
export function addCallText({
  callerName,
  calleeName,
}: AddCallTextInput): AddCallText {
  const between = `${callerName} to ${calleeName}`;
  return {
    undoName: `Add a call from ${between}`,
    announcement: `Added a call from ${between}.`,
  };
}

/**
 * What a draft says when the caller has no edge to any component to call,
 * and where to make one: the caller's box on the diagram, or "Connect to…"
 * in its Details.
 */
export function noEdgesNote(callerName: string): string {
  return `${callerName} has no edges to call along. Connect it first: drag from its handle on the diagram, or choose "Connect to…" in its Details.`;
}
