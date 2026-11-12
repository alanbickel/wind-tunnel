import styles from "./WorkloadView.module.css";

interface IssuesProps {
  readonly messages: readonly string[];
}

/** Sentences about a section or a row. */
export function Issues({ messages }: IssuesProps) {
  return messages.map((message, index) => (
    <p key={index} className={styles.issue}>
      {message}
    </p>
  ));
}

export interface TableProps {
  /** The id of the heading that names the table. */
  readonly labelledBy: string;
}
