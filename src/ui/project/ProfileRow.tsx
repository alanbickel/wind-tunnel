import { useId } from "react";
import type { ProfileRowDetails } from "../../application/details/details";
import { numberDraft } from "../../application/details/number-draft";
import {
  checkRateDraft,
  checkTimeDraft,
  durationMsOf,
} from "../../application/details/workload-fields";
import { rowAfterMove } from "../../application/edits/profile-points";
import {
  movedMessage,
  ONLY_POINT_TEXT,
  rateChangeName,
  removedPointName,
  timeChangeName,
} from "../../application/edits/profile-step-names";
import {
  removeProfilePoint,
  setProfilePoint,
} from "../../application/edits/workload-edits";
import { Button } from "../shared/Button";
import { commitNumber } from "./fields/commit-number";
import { TextField } from "./fields/TextField";
import { useDraft } from "./fields/useDraft";
import { markOf } from "./mark-of";
import type { ProfileEditing } from "./profile-editing";
import { ADD_POINT } from "./useProfileFocus";
import { Issues } from "./WorkloadParts";
import styles from "./WorkloadView.module.css";

export interface ProfileRowProps {
  readonly row: ProfileRowDetails;
  /** The row's place in the table, counting from 0. */
  readonly index: number;
  /** The ids of the lines that explain the time, and the rate. */
  readonly helpIds: HelpIds;
  readonly editing: ProfileEditing;
}

/** The ids of what describes each kind of field in the table. */
export interface HelpIds {
  readonly time: string;
  readonly rate: string;
}

/**
 * One profile point: its number, a time and a rate as draft fields, the note
 * and issues it has, and Remove. A point is addressed by its time, so each
 * command is given the time the row shows.
 */
export function ProfileRow(props: ProfileRowProps) {
  const { row, index, helpIds } = props;
  const pointId = useId();
  return (
    <tr className={markOf(row.issues)}>
      <th scope="row" id={pointId}>
        Point {index + 1}
      </th>
      <td>
        <TimeField {...props} describedBy={`${pointId} ${helpIds.time}`} />
      </td>
      <td>
        <RateField {...props} describedBy={`${pointId} ${helpIds.rate}`} />
      </td>
      <td>
        {row.note}
        <Issues messages={row.issues} />
      </td>
      <td>
        <RemovePoint {...props} />
      </td>
    </tr>
  );
}

interface FieldProps extends ProfileRowProps {
  /** The ids that describe the field: its row, then its help. */
  readonly describedBy: string;
}

/** A point's time, a draft in seconds. A time another point has is refused. */
function TimeField(props: FieldProps) {
  const { row, index, describedBy, editing } = props;
  const draft = useDraft(numberDraft(row.timeSec));
  const check = checkTimeDraft({
    text: draft.value,
    otherTimesSec: otherTimesOf(props),
  });
  return (
    <TextField
      label="Time"
      unit="s"
      inputMode="decimal"
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      helpId={describedBy}
      inputRef={editing.focus.times(index)}
      onCommit={() => {
        commitNumber({
          saved: row.timeSec,
          check,
          announce: editing.announce,
          reset: draft.reset,
          save: (timeSec) => {
            saveTime({ ...props, timeSec, reset: draft.reset });
          },
        });
      }}
    />
  );
}

/** The times, in seconds, of every point but this row's. */
function otherTimesOf({ index, editing }: ProfileRowProps): number[] {
  return editing.rows.filter((_, i) => i !== index).map((r) => r.timeSec);
}

interface SaveTimeInput extends ProfileRowProps {
  readonly timeSec: number;
  /** Puts the field's saved time back. */
  readonly reset: () => void;
}

/**
 * Saves a point's new time as one named undo step. The command puts the
 * point in its place; this only works out where that is, to follow it with
 * the focus and say so when the row changed. It also puts the field's draft
 * back: the row keeps its key when another point took this one's time, as
 * when a stored repeat is fixed, and would keep showing the typed time.
 */
function saveTime(input: SaveTimeInput): void {
  const { row, index, editing, timeSec, reset } = input;
  const { workloadId, workloadName, rows, onEdit, announce, focus } = editing;
  reset();
  const newAtMs = durationMsOf(timeSec);
  const timesMs = rows.map((r) => r.atMs);
  const to = rowAfterMove({ timesMs, index, atMs: newAtMs });
  focus.after(to);
  onEdit({
    command: (record) =>
      setProfilePoint(record, {
        workloadId,
        atMs: row.atMs,
        change: { atMs: newAtMs },
      }),
    describe: () => timeChangeName({ workloadName, atMs: row.atMs, newAtMs }),
  });
  const moved = movedMessage({ from: index, to, rowCount: rows.length });
  if (moved !== undefined) announce(moved);
}

/** A point's rate, a draft in requests/s. */
function RateField(props: FieldProps) {
  const { row, describedBy, editing } = props;
  const draft = useDraft(numberDraft(row.requestsPerSec));
  const check = checkRateDraft(draft.value);
  return (
    <TextField
      label="Rate"
      unit="requests/s"
      inputMode="decimal"
      draft={draft}
      message={check.status === "fails" ? check.message : undefined}
      helpId={describedBy}
      onCommit={() => {
        commitNumber({
          saved: row.requestsPerSec,
          check,
          announce: editing.announce,
          reset: draft.reset,
          save: (requestsPerSec) => {
            saveRate({ ...props, requestsPerSec });
          },
        });
      }}
    />
  );
}

interface SaveRateInput extends ProfileRowProps {
  readonly requestsPerSec: number;
}

/** Saves a point's new rate as one named undo step. */
function saveRate({ row, editing, requestsPerSec }: SaveRateInput): void {
  const { workloadId, workloadName, onEdit } = editing;
  const { atMs } = row;
  onEdit({
    command: (record) =>
      setProfilePoint(record, { workloadId, atMs, change: { requestsPerSec } }),
    describe: () => rateChangeName({ workloadName, atMs, requestsPerSec }),
  });
}

/**
 * "Remove": no confirmation, as Undo restores the point. The only point's
 * Remove is unusable, and says why.
 */
function RemovePoint({ row, index, editing }: ProfileRowProps) {
  const reasonId = useId();
  const { workloadId, workloadName, rows, onEdit, focus } = editing;
  const only = rows.length === 1;
  return (
    <>
      <Button
        label={`Remove point ${String(index + 1)}`}
        usable={!only}
        describedBy={only ? reasonId : undefined}
        onClick={() => {
          focus.after(index + 1 < rows.length ? index : ADD_POINT);
          onEdit({
            command: (record) =>
              removeProfilePoint(record, { workloadId, atMs: row.atMs }),
            describe: () => removedPointName({ workloadName, atMs: row.atMs }),
          });
        }}
      >
        Remove
      </Button>
      {only && (
        <span id={reasonId} className={styles.issue}>
          {ONLY_POINT_TEXT}
        </span>
      )}
    </>
  );
}
