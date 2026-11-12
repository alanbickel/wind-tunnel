import { useId } from "react";
import type {
  MixDetails,
  MixRowDetails,
  ProfileDetails,
  ProfileRowDetails,
  WorkloadDetails,
} from "../../application/details/details";
import styles from "./WorkloadView.module.css";

export interface WorkloadViewProps {
  readonly details: WorkloadDetails;
}

/**
 * A workload, read-only: its duration and seed, its mix with shares, and
 * its profile as a table of times and rates (UX design §2.7). Each issue is
 * said on the row it belongs to, or on its section's own.
 */
export function WorkloadView({ details }: WorkloadViewProps) {
  return (
    <div>
      <dl className={styles.values}>
        <dt>Duration</dt>
        <dd>{details.durationSec} seconds</dd>
        <dt>Seed</dt>
        <dd>{details.seed}</dd>
      </dl>
      <MixSection mix={details.mix} />
      <ProfileSection profile={details.profile} />
    </div>
  );
}

interface IssuesProps {
  readonly messages: readonly string[];
}

/** Sentences about a section or a row. */
function Issues({ messages }: IssuesProps) {
  return messages.map((message) => (
    <p key={message} className={styles.issue}>
      {message}
    </p>
  ));
}

/** The class that marks a section or a row with issues. */
function markOf(messages: readonly string[]): string | undefined {
  return messages.length > 0 ? styles.cantRun : undefined;
}

interface MixSectionProps {
  readonly mix: MixDetails;
}

/** The mix's rows, or what an empty one says, and the shares' total. */
function MixSection({ mix }: MixSectionProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={markOf(mix.issues)}>
      <h5 id={headingId} className={styles.sectionHeading}>
        Mix
      </h5>
      <Issues messages={mix.issues} />
      {mix.emptyText !== undefined && <p>{mix.emptyText}</p>}
      <MixTable mix={mix} labelledBy={headingId} />
      {mix.totalText !== undefined && (
        <p className={styles.total}>{mix.totalText}</p>
      )}
    </section>
  );
}

interface TableProps {
  /** The id of the heading that names the table. */
  readonly labelledBy: string;
}

interface MixTableProps extends TableProps {
  readonly mix: MixDetails;
}

/** The mix's entries as a table; nothing for an empty mix. */
function MixTable({ mix, labelledBy }: MixTableProps) {
  if (mix.rows.length === 0) return null;
  return (
    <table className={styles.table} aria-labelledby={labelledBy}>
      <thead>
        <tr>
          <th scope="col">Workflow</th>
          <th scope="col" className={styles.number}>
            Weight
          </th>
          <th scope="col" className={styles.number}>
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {mix.rows.map((row, index) => (
          <MixRow key={index} row={row} />
        ))}
      </tbody>
    </table>
  );
}

interface MixRowProps {
  readonly row: MixRowDetails;
}

/** One mix entry: its workflow's name, weight, and share, then its issues. */
function MixRow({ row }: MixRowProps) {
  const { workflowName, weight, shareText, issues } = row;
  return (
    <tr className={markOf(issues)}>
      <th scope="row">
        {workflowName}
        <Issues messages={issues} />
      </th>
      <td className={styles.number}>{weight}</td>
      <td className={styles.number}>{shareText ?? "–"}</td>
    </tr>
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
