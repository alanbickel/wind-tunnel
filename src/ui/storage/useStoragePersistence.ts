import { useCallback, useRef, useState } from "react";
import type { PersistenceStatus } from "../../application/ports/storage-persistence";
import { useUseCases } from "../app/useUseCases";

export interface StoragePersistenceState {
  /** The browser's answer; undefined until it has been asked. */
  readonly status: PersistenceStatus | undefined;
  /** Asks the browser to keep the projects; only the first call asks. */
  readonly requestOnce: () => void;
}

/**
 * Asks for persistent storage once per session, when the caller says the
 * user has work to lose. Not at startup: Firefox prompts, and a prompt
 * before the user has made anything reads as noise. A request that throws
 * counts as `unsupported`, so the user still sees the hint.
 */
export function useStoragePersistence(): StoragePersistenceState {
  const { storagePersistence } = useUseCases();
  const [status, setStatus] = useState<PersistenceStatus>();
  // A ref, not state: two creates in one render must still ask only once.
  const asked = useRef(false);

  const requestOnce = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    storagePersistence.request().then(setStatus, () => {
      setStatus("unsupported");
    });
  }, [storagePersistence]);
  return { status, requestOnce };
}
