import { useState, type Ref } from "react";
import type { CallOffer } from "../../application/details/call-offers";
import type { StepAction } from "../../domain/model/project";
import type { CallChoice } from "../../application/use-cases/call-choices";
import { useFocusOnMount } from "../shared/useFocusOnMount";
import { Picker } from "./fields/Picker";

/** The step and the action a call goes with, once both are chosen. */
export interface OfferAnswer {
  readonly stepId: string;
  readonly action: StepAction;
}

export interface OfferQuestionFormProps {
  readonly offer: CallOffer;
  /** The component the call goes to, and the actions its type accepts. */
  readonly choice: CallChoice;
  /** Saves the call once both questions are answered. */
  readonly onAnswer: (answer: OfferAnswer) => void;
}

/** What has been chosen so far. */
interface Chosen {
  readonly stepId: string | undefined;
  readonly action: StepAction | undefined;
}

/**
 * What an edge's offer asks before it adds the call: which step the call
 * goes under, when the edge's box is in the path more than once and none
 * is selected, and which action, when the target accepts several (RDS takes
 * `read` and `write`). Each is asked only when it needs to be; the call
 * saves once both are answered. The first picker takes the focus.
 */
export function OfferQuestionForm(props: OfferQuestionFormProps) {
  const { offer, choice } = props;
  const { chosen, answer } = useAnswers(props);
  const firstRef = useFocusOnMount<HTMLSelectElement>();
  const asksStep = offer.stepId === undefined;
  return (
    <>
      {asksStep && (
        <StepPicker
          offer={offer}
          value={chosen.stepId}
          selectRef={firstRef}
          onPick={(stepId) => {
            answer({ ...chosen, stepId });
          }}
        />
      )}
      {choice.actions.length > 1 && (
        <ActionPicker
          actions={choice.actions}
          value={chosen.action}
          selectRef={asksStep ? undefined : firstRef}
          onPick={(action) => {
            answer({ ...chosen, action });
          }}
        />
      )}
    </>
  );
}

interface StepPickerProps {
  readonly offer: CallOffer;
  readonly value: string | undefined;
  readonly selectRef: Ref<HTMLSelectElement>;
  readonly onPick: (stepId: string) => void;
}

/** The steps the call could go under, each by its outline number and label. */
function StepPicker({ offer, value, selectRef, onPick }: StepPickerProps) {
  return (
    <Picker
      label="Under step"
      selectRef={selectRef}
      prompt="Choose a step"
      value={value}
      options={offer.steps.map((s) => ({
        value: s.stepId,
        text: `${s.number} ${s.label}`,
      }))}
      onPick={onPick}
    />
  );
}

interface ActionPickerProps {
  readonly actions: readonly StepAction[];
  readonly value: StepAction | undefined;
  readonly selectRef: Ref<HTMLSelectElement> | undefined;
  readonly onPick: (action: StepAction | undefined) => void;
}

/** The actions the target's type accepts. */
function ActionPicker({
  actions,
  value,
  selectRef,
  onPick,
}: ActionPickerProps) {
  return (
    <Picker
      label="Action"
      selectRef={selectRef}
      prompt="Choose an action"
      value={value}
      options={actions.map((a) => ({ value: a, text: a }))}
      onPick={(picked) => {
        onPick(actions.find((a) => a === picked));
      }}
    />
  );
}

/** What's chosen so far, and a choice: it saves the call once both are chosen. */
function useAnswers({ offer, choice, onAnswer }: OfferQuestionFormProps) {
  const [chosen, setChosen] = useState<Chosen>({
    stepId: offer.stepId,
    action: choice.actions.length === 1 ? choice.actions[0] : undefined,
  });
  const answer = (next: Chosen) => {
    setChosen(next);
    if (next.stepId === undefined || next.action === undefined) return;
    onAnswer({ stepId: next.stepId, action: next.action });
  };
  return { chosen, answer };
}
