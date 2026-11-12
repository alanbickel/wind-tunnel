import styles from "./WorkloadView.module.css";

/** The class that marks a section or a row with issues. */
export function markOf(messages: readonly string[]): string | undefined {
  return messages.length > 0 ? styles.cantRun : undefined;
}
