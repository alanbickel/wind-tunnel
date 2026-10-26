import type { NumberFieldDescriptor } from "../../../application/details/field-descriptor";
import {
  checkNumberDraft,
  numberDraft,
  settingRule,
} from "../../../application/details/number-draft";
import { setComponentSetting } from "../../../application/edits/component-edits";
import type { FieldProps } from "./field-parts";
import { TextField } from "./TextField";
import { useDraft } from "./useDraft";

export interface NumberFieldProps extends FieldProps {
  readonly field: NumberFieldDescriptor;
  /** As stored. */
  readonly value: unknown;
  /** The id of the setting's help, which also describes the field. */
  readonly helpId: string;
}

/**
 * A number setting (UX design §2.2 step 2): what's typed is a draft,
 * checked against the descriptor's range as it's typed. On Enter, or on
 * leaving the field, a passing draft saves; a failing one stays, with its
 * message, and is announced as the focus leaves.
 */
export function NumberField(props: NumberFieldProps) {
  const { field, value, helpId, componentId, onEdit, announce } = props;
  const draft = useDraft(numberDraft(value));
  const check = checkNumberDraft(draft.value, settingRule(field));

  const commit = () => {
    if (check.status === "fails") {
      announce(check.message);
      return;
    }
    if (check.value === value) return;
    const { key } = field;
    onEdit((record) =>
      setComponentSetting(record, { componentId, key, value: check.value }),
    );
  };

  return (
    <TextField
      label={field.label}
      unit={field.unit}
      inputMode={field.kind === "whole-number" ? "numeric" : "decimal"}
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      onCommit={commit}
      helpId={helpId}
    />
  );
}
