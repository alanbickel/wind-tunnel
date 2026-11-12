import { useId } from "react";
import type {
  ProfileDetails,
  ProfileRowDetails,
  WorkloadDetails,
} from "../../application/details/details";
import type { Edit } from "./useProjectEdits";
import { WorkloadValueFields } from "./fields/WorkloadValueFields";
import { MixSection } from "./MixSection";
import { markOf } from "./mark-of";
import { Issues, type TableProps } from "./WorkloadParts";
import styles from "./WorkloadView.module.css";

export interface WorkloadViewProps {
  readonly details: WorkloadDetails;
  /** Saves a change to the duration, the seed, or the mix. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
}

/**
 * A workload: its duration and seed as fields, then its mix, which is
 * edited, and its profile as a table of times and rates, which is read-only
 * until its own piece (UX design §2.7). Each issue is said on the row it
 * belongs to, or on its section's own.
 */
export function WorkloadView({ details, onEdit, announce }: WorkloadViewProps) {
  return (
    <div>
      <WorkloadValueFields
        details={details}
        onEdit={onEdit}
        announce={announce}
      />
      <MixSection details={details} onEdit={onEdit} announce={announce} />
      <ProfileSection profile={details.profile} />
    </div>
  );
}

interface ProfileSectionProps {
  readonly profile: ProfileDetails;
}

/** The profile's points in stored order: a time and a rate each. */
function ProfileSection({ profile }: ProfileSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={markOf(profile.issues)}>
      <h5 id={headingId} className={styles.sectionHeading}>
        Profile
      </h5>
      <Issues messages={profile.issues} />
      <ProfileTable profile={profile} labelledBy={headingId} />
    </section>
  );
}

interface ProfileTableProps extends TableProps {
  readonly profile: ProfileDetails;
}

/** The profile's points as a table; nothing for a profile with none. */
function ProfileTable({ profile, labelledBy }: ProfileTableProps) {
  if (profile.rows.length === 0) return null;
  return (
    <table className={styles.table} aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col" className={styles.number}>
            Time (s)
          </th>
          <th scope="col" className={styles.number}>
            Rate (requests/s)
          </th>
          <th scope="col">Notes</th>
        </tr>
      </thead>
      <tbody>
        {profile.rows.map((row, index) => (
          <ProfileRow key={index} row={row} />
        ))}
      </tbody>
    </table>
  );
}

interface ProfileRowProps {
  readonly row: ProfileRowDetails;
}

/** One profile point, with the note on it if it's past the run's end, and its issues. */
function ProfileRow({ row }: ProfileRowProps) {
  const { timeSec, requestsPerSec, note, issues } = row;
  return (
    <tr className={markOf(issues)}>
      <td className={styles.number}>{timeSec}</td>
      <td className={styles.number}>{requestsPerSec}</td>
      <td>
        {note}
        <Issues messages={issues} />
      </td>
    </tr>
  );
}
