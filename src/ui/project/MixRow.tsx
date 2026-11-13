import { useId } from "react";
import type { MixRowDetails } from "../../application/details/details";
import { numberDraft } from "../../application/details/number-draft";
import {
  checkWeightDraft,
  WEIGHT_FIELD,
} from "../../application/details/workload-fields";
import {
  removeFromMix,
  setMixWeight,
} from "../../application/edits/workload-edits";
import { Button } from "../shared/Button";
import { commitNumber } from "./fields/commit-number";
import { TextField } from "./fields/TextField";
import { useDraft } from "./fields/useDraft";
import { markOf } from "./mark-of";
import type { MixEditing } from "./mix-editing";
import type { MixFocusTarget } from "./useMixFocus";
import { Swatch } from "./Swatch";
import { Issues } from "./WorkloadParts";
import styles from "./WorkloadView.module.css";

export interface MixRowProps {
  readonly row: MixRowDetails;
  /** What finds this row's weight field to focus it. */
  readonly rowKey: string;
  /** Where the focus goes if this row is removed. */
  readonly afterRemove: MixFocusTarget;
  /** The id of the line that explains weights. */
  readonly helpId: string;
  readonly editing: MixEditing;
}

/** One mix entry: its workflow's name and issues, weight, share, and Remove. */
export function MixRow(props: MixRowProps) {
  const { row, helpId } = props;
  const nameId = useId();
  return (
    <tr className={markOf(row.issues)}>
      <th scope="row" id={nameId}>
        <Swatch colorIndex={row.colorIndex} />
        {row.workflowName}
        <Issues messages={row.issues} />
      </th>
      <td>
        <WeightField {...props} describedBy={`${nameId} ${helpId}`} />
      </td>
      <td className={styles.number}>{row.shareText ?? "–"}</td>
      <td>
        <RemoveFromMix {...props} />
      </td>
    </tr>
  );
}

/** "Remove from mix": no confirmation, as Undo restores the entry. */
function RemoveFromMix({ row, afterRemove, editing }: MixRowProps) {
  const { workflowId, workflowName } = row;
  const { workloadId, workloadName, onEdit, focus } = editing;
  return (
    <Button
      label={`Remove ${workflowName} from mix`}
      onClick={() => {
        focus.after(afterRemove);
        onEdit({
          command: (record) =>
            removeFromMix(record, { workloadId, workflowId }),
          describe: () => `Remove ${workflowName} from ${workloadName}'s mix`,
        });
      }}
    >
      Remove from mix
    </Button>
  );
}

interface WeightFieldProps extends MixRowProps {
  /** The ids that describe the field: its row's workflow, then the help. */
  readonly describedBy: string;
}

/** An entry's weight, a draft number more than 0; saves on Enter or on leaving. */
function WeightField(props: WeightFieldProps) {
  const { row, rowKey, describedBy, editing } = props;
  const draft = useDraft(numberDraft(row.weight));
  const check = checkWeightDraft(draft.value);
  return (
    <TextField
      label={WEIGHT_FIELD.label}
      inputMode="decimal"
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      helpId={describedBy}
      inputRef={editing.focus.weights(rowKey)}
      onCommit={() => {
        commitNumber({
          saved: row.weight,
          check,
          announce: editing.announce,
          reset: draft.reset,
          save: (weight) => {
            saveWeight({ ...props, weight });
          },
        });
      }}
    />
  );
}

interface SaveWeightInput extends MixRowProps {
  readonly weight: number;
}

/** Saves a weight as one named undo step. */
function saveWeight({ row, editing, weight }: SaveWeightInput): void {
  const { workflowId, workflowName } = row;
  const { workloadId, workloadName, onEdit } = editing;
  onEdit({
    command: (record) =>
      setMixWeight(record, { workloadId, workflowId, weight }),
    describe: () =>
      `Change ${workflowName}'s weight in ${workloadName} to ${String(weight)}`,
  });
}
