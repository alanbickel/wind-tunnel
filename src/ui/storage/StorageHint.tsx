import { useRef } from "react";
import type { PersistenceStatus } from "../../application/ports/storage-persistence";
import { Button } from "../shared/Button";
import styles from "./StorageHint.module.css";
import type { StoragePersistenceState } from "./useStoragePersistence";

export interface StorageHintProps {
  /** The session's storage state: the browser's answer, and whether the strip is dismissed. */
  readonly storage: StoragePersistenceState;
}

const MAY_BE_CLEARED =
  "Your browser may clear your projects if this device runs low on storage.";

const HINTS: Record<PersistenceStatus, string> = {
  persisted: "",
  "best-effort": MAY_BE_CLEARED,
  unsupported: MAY_BE_CLEARED,
};

/**
 * A dismissible strip across the window, under the top bar, shown only when
 * the browser won't promise to keep the user's projects. The live region
 * stays mounted, so screen readers announce the warning when it appears;
 * with nothing to say, or once dismissed, the strip draws nothing.
 */
export function StorageHint(props: StorageHintProps) {
  const { status, dismissed, dismiss } = props.storage;
  const text = status === undefined || dismissed ? "" : HINTS[status];
  const region = useRef<HTMLDivElement>(null);
  return (
    <div role="status" ref={region} tabIndex={-1}>
      {text !== "" && (
        <div className={styles.strip}>
          <p className={styles.text}>{text}</p>
          <Button
            variant="link"
            onClick={() => {
              // The button goes with the strip: keep the focus on the page.
              region.current?.focus();
              dismiss();
            }}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
