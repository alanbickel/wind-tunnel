/** The queue and the consumer a new async root joins, and whether it adds an edge between them. */
export interface AddAsyncWorkTextInput {
  readonly queueName: string;
  readonly consumerName: string;
  /** True when the queue has no edge to the consumer yet. */
  readonly addsEdge: boolean;
}

/** What new async work is named for Undo, and what is announced when it's saved. */
export interface AddAsyncWorkText {
  /** E.g. "Add async work from orders-queue to fn-writer, and its edge". */
  readonly undoName: string;
  /** E.g. "Added async work from orders-queue to fn-writer." */
  readonly announcement: string;
}

/**
 * The words for adding async work (UX design §2.5 step 8, §4.4, ADR-0021
 * decision 6). Like a call along a missing edge, it adds the edge too, which
 * appears on the diagram away from the focus, so the announcement says so,
 * and Undo's name names both.
 */
export function addAsyncWorkText({
  queueName,
  consumerName,
  addsEdge,
}: AddAsyncWorkTextInput): AddAsyncWorkText {
  const between = `${queueName} to ${consumerName}`;
  const undoName = `Add async work from ${between}`;
  if (!addsEdge) {
    return { undoName, announcement: `Added async work from ${between}.` };
  }
  return {
    undoName: `${undoName}, and its edge`,
    announcement: `Added async work from ${between}. Added the edge from ${between}.`,
  };
}

/** What is announced when removing an async root leaves its queue's slot empty. */
export function emptiedSlotAnnouncement({
  removedLabel,
  queueLabel,
}: EmptiedSlotInput): string {
  return `Removed ${removedLabel}. ${queueLabel} has no async work now.`;
}

/** The async root removed, and the queue step whose slot it leaves empty, by their labels. */
export interface EmptiedSlotInput {
  /** E.g. "fn-writer · invoke". */
  readonly removedLabel: string;
  /** E.g. "orders-queue · enqueue". */
  readonly queueLabel: string;
}
