import { useId } from "react";
import type {
  ProfileDetails,
  WorkloadDetails,
} from "../../application/details/details";
import {
  RATE_FIELD,
  TIME_FIELD,
} from "../../application/details/workload-fields";
import { nextPointAtMs } from "../../application/edits/profile-points";
import { addedPointName } from "../../application/edits/profile-step-names";
import { addProfilePoint } from "../../application/edits/workload-edits";
import { ProfileChart } from "../charts/ProfileChart";
import { Button } from "../shared/Button";
import fieldStyles from "./fields/Fields.module.css";
import { markOf } from "./mark-of";
import { pointKeys, type ProfileEditing } from "./profile-editing";
import { ProfileRow, type HelpIds } from "./ProfileRow";
import { useProfileEditing } from "./useProfileEditing";
import type { Edit } from "./useProjectEdits";
import { Issues, type TableProps } from "./WorkloadParts";
import styles from "./WorkloadView.module.css";

export interface ProfileSectionProps {
  readonly details: WorkloadDetails;
  /** Saves a change to the profile. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
}

/**
 * A workload's profile, edited in place (UX design §2.7 steps 6 and 7): a
 * read-only chart of the line it makes, drawn from the saved points, and
 * above a table of the points in time order, each with its time and rate as
 * draft fields and Remove, then "Add point". Each saved change is one named
 * undo step, and the commands, not this screen, keep the points in order.
 */
export function ProfileSection(props: ProfileSectionProps) {
  const headingId = useId();
  const editing = useProfileEditing(props);
  const { profile } = props.details;
  return (
    <section aria-labelledby={headingId} className={markOf(profile.issues)}>
      <h5 id={headingId} className={styles.sectionHeading}>
        Profile
      </h5>
      <Issues messages={profile.issues} />
      <ProfileChart line={profile.line} />
      <ProfileTable
        profile={profile}
        editing={editing}
        labelledBy={headingId}
      />
      <AddPoint editing={editing} />
    </section>
  );
}

interface ProfileTableProps extends TableProps {
  readonly profile: ProfileDetails;
  readonly editing: ProfileEditing;
}

/** The profile's points as a table, and what describes its fields; nothing for a profile with none. */
function ProfileTable({ profile, editing, labelledBy }: ProfileTableProps) {
  const helpIds: HelpIds = { time: useId(), rate: useId() };
  if (profile.rows.length === 0) return null;
  const keys = pointKeys(profile.rows);
  return (
    <>
      <ProfileHelp ids={helpIds} />
      <table className={styles.table} aria-labelledby={labelledBy}>
        <ProfileTableHead />
        <tbody>
          {profile.rows.map((row, index) => (
            <ProfileRow
              key={keys[index]}
              row={row}
              index={index}
              helpIds={helpIds}
              editing={editing}
            />
          ))}
        </tbody>
      </table>
    </>
  );
}

interface ProfileHelpProps {
  readonly ids: HelpIds;
}

/** What the time and rate fields mean, once, above the table; each field's description points here. */
function ProfileHelp({ ids }: ProfileHelpProps) {
  return (
    <>
      <p id={ids.time} className={fieldStyles.help}>
        {TIME_FIELD.help}
      </p>
      <p id={ids.rate} className={fieldStyles.help}>
        {RATE_FIELD.help}
      </p>
    </>
  );
}

/** The table's column headers; the last, for the buttons, is read but not shown. */
function ProfileTableHead() {
  return (
    <thead>
      <tr>
        <th scope="col">Point</th>
        <th scope="col">Time (s)</th>
        <th scope="col">Rate (requests/s)</th>
        <th scope="col">Notes</th>
        <th scope="col">
          <span className={styles.hidden}>Actions</span>
        </th>
      </tr>
    </thead>
  );
}

interface AddPointProps {
  readonly editing: ProfileEditing;
}

/**
 * "Add point": appends a point 10 s after the last one's time, at its rate,
 * and moves the focus to its time field.
 */
function AddPoint({ editing }: AddPointProps) {
  const { workloadId, workloadName, rows, onEdit, focus } = editing;
  return (
    <Button
      ref={(element) => {
        focus.addPoint(element);
      }}
      onClick={() => {
        const atMs = nextPointAtMs(rows.map((row) => row.atMs));
        focus.after(rows.filter((row) => row.atMs < atMs).length);
        onEdit({
          command: (record) => addProfilePoint(record, { workloadId, atMs }),
          describe: () => addedPointName({ workloadName, atMs }),
        });
      }}
    >
      Add point
    </Button>
  );
}
