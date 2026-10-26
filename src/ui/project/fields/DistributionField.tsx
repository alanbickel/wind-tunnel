import { useId } from "react";
import type { DistributionFieldDescriptor } from "../../../application/details/field-descriptor";
import {
  checkDistributionDraft,
  distributionDraft,
  switchKind,
  type DistributionDraft,
} from "../../../application/details/distribution-draft";
import {
  DISTRIBUTION_KINDS,
  DISTRIBUTION_PARTS,
  type DistributionKind,
  type DistributionPart,
} from "../../../application/details/distribution-parts";
import { setComponentSetting } from "../../../application/edits/component-edits";
import { sameContent } from "../../../application/run-analysis/same-content";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { TextField } from "./TextField";
import { useDraft, type Draft } from "./useDraft";

export interface DistributionFieldProps extends FieldProps {
  readonly field: DistributionFieldDescriptor;
  /** As stored: a `Distribution`. */
  readonly value: unknown;
  /** The id of the setting's help, which also describes the group. */
  readonly helpId: string;
}

/**
 * A duration distribution (UX design §2.2 step 4): a kind picker, and a
 * field for each of the kind's numbers, in ms. The draft is the whole
 * distribution: it saves when a part's field is left, or the kind
 * changes, if every part passes and a lognormal's p99 is at least its
 * median. Changing the kind fills the new parts from the old ones, so a
 * switch never leaves a field empty.
 */
export function DistributionField(props: DistributionFieldProps) {
  const { field, helpId } = props;
  const { draft, messages, commit, pick } = useDistributionDraft(props);
  return (
    <fieldset className={styles.group} aria-describedby={helpId}>
      <legend className={styles.label}>{field.label}</legend>
      <KindPicker kind={draft.value.kind} onPick={pick} />
      {DISTRIBUTION_PARTS[draft.value.kind].map((part) => (
        <TextField
          key={part.key}
          label={part.label}
          unit="ms"
          inputMode="decimal"
          draft={partDraft(draft, part)}
          message={messages[part.key]}
          onCommit={() => {
            commit(draft.value);
          }}
        />
      ))}
    </fieldset>
  );
}

interface KindPickerProps {
  readonly kind: DistributionKind;
  readonly onPick: (kind: DistributionKind) => void;
}

/** The distribution's kind: constant, exponential, or lognormal. */
function KindPicker({ kind, onPick }: KindPickerProps) {
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        Kind
      </label>
      <select
        id={id}
        value={kind}
        onChange={(event) => {
          const picked = DISTRIBUTION_KINDS.find(
            (option) => option === event.target.value,
          );
          if (picked) onPick(picked);
        }}
      >
        {DISTRIBUTION_KINDS.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </div>
  );
}

/** A distribution field's draft, its messages, and what commits it. */
interface DistributionDraftState {
  readonly draft: Draft<DistributionDraft>;
  /** Each failing part's message, by the part's key. */
  readonly messages: Readonly<Record<string, string>>;
  /** Saves `next` if it passes; announces what's wrong if not. */
  readonly commit: (next: DistributionDraft) => void;
  /** Switches the kind, and saves the switch. */
  readonly pick: (kind: DistributionKind) => void;
}

function useDistributionDraft(
  props: DistributionFieldProps,
): DistributionDraftState {
  const { field, value, componentId, onEdit, announce } = props;
  const draft = useDraft(distributionDraft(value));
  const check = checkDistributionDraft(draft.value);
  const commit = (next: DistributionDraft) => {
    const checked = checkDistributionDraft(next);
    if (checked.status === "fails") {
      announce(Object.values(checked.messages).join(" "));
      return;
    }
    if (sameContent(checked.value, value)) return;
    const { key } = field;
    onEdit((record) =>
      setComponentSetting(record, { componentId, key, value: checked.value }),
    );
  };
  const pick = (kind: DistributionKind) => {
    const next = switchKind(draft.value, kind);
    draft.set(next);
    commit(next);
  };
  const messages = check.status === "fails" ? check.messages : {};
  return { draft, messages, commit, pick };
}

/** One part's text, as a draft of its own over the distribution's. */
function partDraft(
  draft: Draft<DistributionDraft>,
  part: DistributionPart,
): Draft<string> {
  const { value } = draft;
  return {
    value: value.texts[part.key] ?? "",
    set: (text) => {
      draft.set({ ...value, texts: { ...value.texts, [part.key]: text } });
    },
    reset: draft.reset,
    changed: draft.changed,
  };
}
