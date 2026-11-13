import { useMemo } from "react";
import {
  callOffersOf,
  type CallOffer,
} from "../../application/details/call-offers";
import type { Selection } from "../../application/details/selection";
import type { CallChoice } from "../../application/use-cases/call-choices";
import type { NewCallStart } from "../../application/use-cases/new-call";
import type { Project } from "../../domain/model/project";
import { useUseCases } from "../app/useUseCases";
import type { UseCases } from "../app/use-cases";
import type { EdgeOffer, OfferQuestion } from "../diagram/diagram-model";
import { OfferQuestionForm, type OfferAnswer } from "./OfferQuestionForm";
import type { Edit } from "./useProjectEdits";
import { useStepEdits, type StepEdits } from "./useStepEdits";
import type { ProjectSelection } from "./useSelection";

/** What an offer saves through, selects with, and says. */
export interface OfferingProps {
  readonly onEdit: (edit: Edit) => void;
  readonly onSelect: ProjectSelection["selectWithin"];
  /** Says a message in a polite region that is on the page from the start. */
  readonly announce: (message: string) => void;
}

/** What the offers are drawn from, and what they do. */
export interface EdgeOffersInput extends OfferingProps {
  readonly project: Project;
  readonly selection: Selection | undefined;
}

/**
 * The offers the canvas draws while a workflow, or one of its steps, is
 * selected: each edge leaving a box in its path carries a "+" that adds a
 * call along it (UX design §7). Using one runs the same `addCall` as the
 * outline's "Add a call from …", or `addAsyncWork` for a queue's empty
 * slot, so it is one saved undo step, named and announced as the outline's
 * is, and no edge is added. It asks only what it must: which step, when
 * several could take the call, and which action, when the target accepts
 * several.
 */
export function useEdgeOffers(input: EdgeOffersInput): EdgeOffer[] {
  const { project, selection, onEdit, onSelect, announce } = input;
  const { newCall } = useUseCases();
  const offers = useMemo(
    () => callOffersOf(project, selection),
    [project, selection],
  );
  const edits = useStepEdits({
    workflowId: offers[0]?.workflowId ?? "",
    onEdit,
    onSelect,
    announce,
  });
  return useMemo(
    () =>
      offers.map((offer) => ({
        edgeId: offer.edgeId,
        label: offer.label,
        onUse: () => {
          const start = startOf({ newCall, project, offer });
          return start && askOrAdd({ offer, start, edits });
        },
      })),
    [offers, newCall, project, edits],
  );
}

/** A call's id and its caller's choices, read when an offer is used. */
interface StartInput {
  readonly newCall: UseCases["newCall"];
  readonly project: Project;
  readonly offer: CallOffer;
}

/**
 * What a new call starts with, from any step that could take it: they're
 * all on the edge's source, so they offer the same choices.
 */
function startOf({
  newCall,
  project,
  offer,
}: StartInput): NewCallStart | undefined {
  const stepId = offer.steps[0]?.stepId;
  if (stepId === undefined) return undefined;
  return newCall.execute({ project, workflowId: offer.workflowId, stepId });
}

/** An offer being used, with what a call starts with. */
interface UseInput {
  readonly offer: CallOffer;
  readonly start: NewCallStart;
  readonly edits: StepEdits;
}

/**
 * Adds the call at once if nothing needs asking, and returns no question;
 * otherwise returns the question to ask first. Nothing if the target is
 * gone, or accepts no action.
 */
function askOrAdd({
  offer,
  start,
  edits,
}: UseInput): OfferQuestion | undefined {
  const choice = start.choices.find((c) => c.componentId === offer.targetId);
  if (choice === undefined || choice.actions.length === 0) return undefined;
  const save = (answer: OfferAnswer) => {
    saveCall({ offer, start, choice, edits }, answer);
  };
  const [only] = choice.actions;
  if (offer.stepId !== undefined && choice.actions.length === 1 && only) {
    save({ stepId: offer.stepId, action: only });
    return undefined;
  }
  return (close) => (
    <OfferQuestionForm
      offer={offer}
      choice={choice}
      onAnswer={(answer) => {
        save(answer);
        close();
      }}
    />
  );
}

/** A call to save, and the edits that save it. */
interface SaveCallInput extends UseInput {
  readonly choice: CallChoice;
}

/** Saves the call under the step answered, as a call or, in a queue's slot, as async work. */
function saveCall(
  { offer, start, choice, edits }: SaveCallInput,
  { stepId, action }: OfferAnswer,
): void {
  const kind = offer.steps.find((s) => s.stepId === stepId)?.kind;
  const added = { callerStepId: stepId, start, choice, action };
  if (kind === "async") edits.addAsync(added);
  else edits.add(added);
}
