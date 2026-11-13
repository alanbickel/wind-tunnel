import type { RemovalText } from "./details";

/** A step's old and new label, and what the change drops. */
export interface ChangeStepTextInput {
  /** The step's label before: "fn-orders · invoke". */
  readonly fromLabel: string;
  /** Its label after: "orders-db · read". */
  readonly toLabel: string;
  /** How many steps under the step the change drops. */
  readonly stepsBelow: number;
  /** True when the step is now an `enqueue`, which has an empty async slot. */
  readonly toEnqueue: boolean;
}

/** What the question before a change needs: the labels, and how many steps go. */
export type ChangeStepQuestionInput = Pick<
  ChangeStepTextInput,
  "fromLabel" | "toLabel" | "stepsBelow"
>;

/** What a step's change is named for Undo, and what is announced when it's saved. */
export interface ChangeStepText {
  /** E.g. "Change fn-orders · invoke to orders-db · read". */
  readonly undoName: string;
  /** E.g. "Changed fn-orders · invoke to orders-db · read." */
  readonly announcement: string;
}

/** "1 step", "3 steps". */
function stepCount(count: number): string {
  return `${String(count)} ${count === 1 ? "step" : "steps"}`;
}

/**
 * The sentences a change adds to the announcement, after the first: the
 * steps it drops, and the empty slot an `enqueue` has.
 */
function addedSentences({
  stepsBelow,
  toEnqueue,
}: ChangeStepTextInput): string[] {
  const gone = stepsBelow === 1 ? "is" : "are";
  return [
    stepsBelow > 0 && `The ${stepCount(stepsBelow)} under it ${gone} gone.`,
    toEnqueue && "It has no async work yet.",
  ].filter((sentence) => typeof sentence === "string");
}

/**
 * The words for changing a step (UX design §2.5 step 6, §4.4). A change
 * drops everything under the step, so the announcement says so, and Undo's
 * name names them.
 */
export function changeStepText(input: ChangeStepTextInput): ChangeStepText {
  const { fromLabel, toLabel, stepsBelow } = input;
  const dropPart =
    stepsBelow === 0
      ? ""
      : `, and remove the ${stepCount(stepsBelow)} under it`;
  return {
    undoName: `Change ${fromLabel} to ${toLabel}${dropPart}`,
    announcement: [
      `Changed ${fromLabel} to ${toLabel}.`,
      ...addedSentences(input),
    ].join(" "),
  };
}

/**
 * The question asked before a change that drops steps, as Remove's is
 * (ADR-0021 decision 3): the change, and how many steps go. Undefined when
 * nothing is under the step, which changes at once.
 */
export function changeStepQuestion({
  fromLabel,
  toLabel,
  stepsBelow,
}: ChangeStepQuestionInput): RemovalText | undefined {
  if (stepsBelow === 0) return undefined;
  return {
    question: `Change ${fromLabel} to ${toLabel}? The ${stepCount(stepsBelow)} under it ${stepsBelow === 1 ? "goes" : "go"}.`,
    warning: undefined,
  };
}
