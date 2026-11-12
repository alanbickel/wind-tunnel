import { useId } from "react";
import type {
  MixDetails,
  WorkloadDetails,
} from "../../application/details/details";
import { WEIGHT_FIELD } from "../../application/details/workload-fields";
import { addToMix } from "../../application/edits/workload-edits";
import { Explained } from "../shared/Explained";
import fieldStyles from "./fields/Fields.module.css";
import { Picker } from "./fields/Picker";
import { markOf } from "./mark-of";
import { rowKeys, type MixEditing } from "./mix-editing";
import { MixRow } from "./MixRow";
import { ADD_TO_MIX, useMixFocus } from "./useMixFocus";
import type { Edit } from "./useProjectEdits";
import { Issues, type TableProps } from "./WorkloadParts";
import styles from "./WorkloadView.module.css";

export interface MixSectionProps {
  readonly details: WorkloadDetails;
  /** Saves a change to the mix. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
}

/**
 * A workload's mix, edited in place (UX design §2.7 steps 5 and 10): the
 * shares' total, a row for each entry with its weight as a draft field, its
 * share, and Remove from mix, then a picker that adds a workflow not yet in
 * it. Each saved change is one named undo step, and the focus goes where
 * the change leaves the user.
 */
export function MixSection({ details, onEdit, announce }: MixSectionProps) {
  const headingId = useId();
  const focus = useMixFocus();
  const { mix, workloadId, name } = details;
  const editing: MixEditing = {
    workloadId,
    workloadName: name,
    onEdit,
    announce,
    focus,
  };
  return (
    <section aria-labelledby={headingId} className={markOf(mix.issues)}>
      <h5 id={headingId} className={styles.sectionHeading}>
        Mix
      </h5>
      {/* An empty mix's words already say its problem, so it isn't said twice. */}
      {mix.emptyText === undefined ? (
        <Issues messages={mix.issues} />
      ) : (
        <p className={styles.issue}>{mix.emptyText}</p>
      )}
      {mix.totalText !== undefined && (
        <p className={styles.total}>{mix.totalText}</p>
      )}
      <MixTable mix={mix} editing={editing} labelledBy={headingId} />
      <AddToMix mix={mix} editing={editing} />
    </section>
  );
}

interface MixTableProps extends TableProps {
  readonly mix: MixDetails;
  readonly editing: MixEditing;
}

/** The mix's entries as a table, and what describes the weights; nothing for an empty mix. */
function MixTable({ mix, editing, labelledBy }: MixTableProps) {
  const helpId = useId();
  if (mix.rows.length === 0) return null;
  const keys = rowKeys(mix.rows);
  return (
    <>
      <WeightHelp id={helpId} />
      <table className={styles.table} aria-labelledby={labelledBy}>
        <MixTableHead />
        <tbody>
          {mix.rows.map((row, index) => (
            <MixRow
              key={keys[index]}
              row={row}
              rowKey={keys[index] ?? row.workflowId}
              afterRemove={keys[index + 1] ?? ADD_TO_MIX}
              helpId={helpId}
              editing={editing}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

interface WeightHelpProps {
  readonly id: string;
}

/** What a weight means, behind an info control; each weight's description points at `id`. */
function WeightHelp({ id }: WeightHelpProps) {
  return (
    <Explained
      title={<span className={fieldStyles.label}>{WEIGHT_FIELD.label}</span>}
      subject={WEIGHT_FIELD.label}
    >
      <p id={id} className={fieldStyles.help}>
        {WEIGHT_FIELD.help}
      </p>
    </Explained>
  );
}

/** The mix table's column headers; the last, for the buttons, is read but not shown. */
function MixTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Workflow</th>
        <th scope="col">Weight</th>
        <th scope="col" className={styles.number}>
          Share
        </th>
        <th scope="col">
          <span className={styles.hidden}>Actions</span>
        </th>
      </tr>
    </thead>
  );
}

interface AddToMixProps {
  readonly mix: MixDetails;
  readonly editing: MixEditing;
}

/**
 * "Add to mix": a picker of the project's workflows that aren't in the mix.
 * Choosing one appends it at weight 1 and moves the focus to its weight
 * field. With nothing to offer it's unusable, and says why.
 */
function AddToMix({ mix, editing }: AddToMixProps) {
  const { workloadId, workloadName, onEdit, focus } = editing;
  const options = mix.addable.map((w) => ({
    value: w.workflowId,
    text: w.name,
  }));
  return (
    <Picker
      label="Add to mix"
      prompt="Choose a workflow"
      value={undefined}
      options={options}
      selectRef={focus.picker}
      usable={mix.addUnusableText === undefined}
      explanation={mix.addUnusableText}
      onPick={(workflowId) => {
        const text = options.find((o) => o.value === workflowId)?.text;
        focus.after(workflowId);
        onEdit({
          command: (record) => addToMix(record, { workloadId, workflowId }),
          describe: () => `Add ${text ?? workflowId} to ${workloadName}'s mix`,
        });
      }}
    />
  );
}
