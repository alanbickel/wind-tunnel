import type { ProjectRecord } from "../../application/ports/project-record";

export interface SaveQueueDependencies {
  /** Saves one record; resolves true if it saved, false if it didn't. Never rejects. */
  readonly save: (record: ProjectRecord) => Promise<boolean>;
  /** Told when the last change fails to save, and when a later save works. */
  readonly onFailedChange: (failed: boolean) => void;
}

/** Sends a project screen's saves one at a time, in order (UX design §4.3). */
export interface SaveQueue {
  /** Saves `record`, after the save in flight, if there is one. */
  readonly save: (record: ProjectRecord) => void;
  /** Saves the record that failed again. */
  readonly retry: () => void;
}

/**
 * A queue of saves. Each record is the whole project, so a record waiting
 * behind the one in flight is replaced by a newer one: the newer holds
 * every change the older did, and the saves still land in the order the
 * changes were made. A record that fails is kept for `retry`, unless a
 * newer one is already waiting, which holds its change too.
 */
export function createSaveQueue(deps: SaveQueueDependencies): SaveQueue {
  let waiting: ProjectRecord | undefined;
  let failed: ProjectRecord | undefined;
  let busy = false;
  // Read through a function: `save` can set `waiting` while a save is in
  // flight, which TypeScript's narrowing can't see across the `await`.
  const nextWaiting = (): ProjectRecord | undefined => waiting;

  const saveWaiting = async (): Promise<void> => {
    if (busy) return;
    busy = true;
    for (let record = waiting; record !== undefined; record = nextWaiting()) {
      waiting = undefined;
      const saved = await deps.save(record);
      failed = saved ? undefined : record;
      if (saved || nextWaiting() === undefined) deps.onFailedChange(!saved);
    }
    busy = false;
  };

  return {
    save: (record) => {
      waiting = record;
      void saveWaiting();
    },
    retry: () => {
      waiting ??= failed;
      void saveWaiting();
    },
  };
}
