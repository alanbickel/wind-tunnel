import { Button } from "../shared/Button";
import styles from "./SaveFailure.module.css";

export interface SaveFailureProps {
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly onRetry: () => void;
}

/**
 * A strip in the banner, under the top bar, while the last change didn't
 * save, offering to save it again (UX design §2, §4.3): it affects the
 * whole project. The message's region is mounted from the start, empty,
 * so screen readers announce it (§10); Try again sits outside it, so it
 * isn't read as part of the message. While the last change saved, the
 * strip takes no room.
 */
export function SaveFailure({ saveFailed, onRetry }: SaveFailureProps) {
  return (
    <div className={saveFailed ? styles.strip : undefined}>
      <p role="status" className={styles.text}>
        {saveFailed ? "Couldn't save your last change." : ""}
      </p>
      {saveFailed && (
        <Button variant="link" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
