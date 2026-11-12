import { useId } from "react";
import type { WorkloadDetails } from "../../../application/details/details";
import type { RangedFieldDescriptor } from "../../../application/details/field-descriptor";
import {
  numberDraft,
  type DraftCheck,
} from "../../../application/details/number-draft";
import {
  checkDurationDraft,
  checkSeedDraft,
  DURATION_FIELD,
  durationMsOf,
  SEED_FIELD,
} from "../../../application/details/workload-fields";
import {
  setWorkloadDuration,
  setWorkloadSeed,
} from "../../../application/edits/workload-edits";
import type { Edit } from "../useProjectEdits";
import type { FieldProps } from "./field-parts";
import styles from "./Fields.module.css";
import { TextField } from "./TextField";
import { useDraft } from "./useDraft";

export interface WorkloadValueFieldsProps {
  readonly details: WorkloadDetails;
  /** Saves a change, once its draft passes. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: FieldProps["announce"];
}

/**
 * A workload's duration and seed, two draft number fields (UX design §2.7
 * steps 4 and 7). Each saves on Enter or on leaving, a passing draft as one
 * named undo step; a failing one stays with its message.
 */
export function WorkloadValueFields(props: WorkloadValueFieldsProps) {
  return (
    <div>
      <DurationField {...props} />
      <SeedField {...props} />
    </div>
  );
}

/** The duration, in seconds as the user reads it; the stored value is ms. */
function DurationField({
  details,
  onEdit,
  announce,
}: WorkloadValueFieldsProps) {
  const { workloadId, name } = details;
  return (
    <WorkloadNumberField
      field={DURATION_FIELD}
      saved={details.durationSec}
      check={checkDurationDraft}
      announce={announce}
      save={(durationSec) => {
        const durationMs = durationMsOf(durationSec);
        onEdit({
          command: (record) =>
            setWorkloadDuration(record, { workloadId, durationMs }),
          describe: () =>
            `Change ${name}'s duration to ${String(durationSec)} s`,
        });
      }}
    />
  );
}

function SeedField({ details, onEdit, announce }: WorkloadValueFieldsProps) {
  const { workloadId, name } = details;
  return (
    <WorkloadNumberField
      field={SEED_FIELD}
      saved={details.seed}
      check={checkSeedDraft}
      announce={announce}
      save={(seed) => {
        onEdit({
          command: (record) => setWorkloadSeed(record, { workloadId, seed }),
          describe: () => `Change ${name}'s seed to ${String(seed)}`,
        });
      }}
    />
  );
}

interface WorkloadNumberFieldProps {
  readonly field: RangedFieldDescriptor;
  /** As the field shows it: seconds for the duration. */
  readonly saved: number;
  /** Checks a draft; a passing one holds the number typed. */
  readonly check: (text: string) => DraftCheck<number>;
  readonly save: (value: number) => void;
  readonly announce: FieldProps["announce"];
}

/** One number field and its help, which also describes it. */
function WorkloadNumberField(props: WorkloadNumberFieldProps) {
  const { field, saved, check: checkDraft } = props;
  const helpId = useId();
  const draft = useDraft(numberDraft(saved));
  const check = checkDraft(draft.value);
  return (
    <div className={styles.setting}>
      <TextField
        label={field.label}
        unit={field.unit}
        inputMode={field.kind === "whole-number" ? "numeric" : "decimal"}
        draft={draft}
        message={check.status === "fails" ? check.message : undefined}
        onCommit={() => {
          commitNumber({ ...props, check, reset: draft.reset });
        }}
        helpId={helpId}
      />
      <p id={helpId} className={styles.help}>
        {field.help}
      </p>
    </div>
  );
}

interface CommitNumberInput extends Omit<WorkloadNumberFieldProps, "check"> {
  /** The draft, checked. */
  readonly check: DraftCheck<number>;
  /** Puts back the saved number. */
  readonly reset: () => void;
}

/**
 * Saves the number if the draft passes and differs; announces its message
 * if it fails. The same number, such as "45.0" for 45, saves nothing and
 * shows the saved number.
 */
function commitNumber(input: CommitNumberInput): void {
  const { check, saved, save, announce, reset } = input;
  if (check.status === "fails") {
    announce(check.message);
    return;
  }
  if (check.value === saved) {
    reset();
    return;
  }
  save(check.value);
}
