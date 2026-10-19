import type { PersistenceStatus } from "../../application/ports/storage-persistence";
import styles from "./StorageHint.module.css";

export interface StorageHintProps {
  /** The browser's answer; undefined until it has been asked. */
  readonly status: PersistenceStatus | undefined;
}

const MAY_BE_CLEARED =
  "Your browser may clear your projects if this device runs low on storage.";

const HINTS: Record<PersistenceStatus, string> = {
  persisted: "",
  "best-effort": MAY_BE_CLEARED,
  unsupported: MAY_BE_CLEARED,
};

/**
 * Warns the user when the browser won't promise to keep their projects.
 * The live region stays mounted, so screen readers announce the warning
 * when it appears.
 */
export function StorageHint({ status }: StorageHintProps) {
  return (
    <p role="status" className={styles.hint}>
      {status === undefined ? "" : HINTS[status]}
    </p>
  );
}
