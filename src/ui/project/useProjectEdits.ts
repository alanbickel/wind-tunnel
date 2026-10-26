import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { ProjectRecord } from "../../application/ports/project-record";
import { useUseCases } from "../app/useUseCases";
import { createSaveQueue, type SaveQueue } from "./save-queue";

/**
 * One change to a project: an edit command from `application/edits/`,
 * with its input filled in. It takes the record and returns the next one.
 */
export type EditCommand = (record: ProjectRecord) => ProjectRecord;

/** The record a project screen holds, and how it changes. */
export interface ProjectEdits {
  /** The project as the screen shows it, with every change made so far. */
  readonly record: ProjectRecord;
  /** Applies a command to the record, shows the result, and saves it. */
  readonly edit: (command: EditCommand) => void;
  /** True once the last change failed to save, until a save works. */
  readonly saveFailed: boolean;
  /** Saves the change that failed again. */
  readonly retry: () => void;
}

/** The loaded record, and the record the screen holds since it loaded. */
interface HeldRecord {
  readonly loaded: ProjectRecord;
  readonly record: ProjectRecord;
}

/**
 * Holds the opened project's record, applies each edit command to it, and
 * saves the result through `saveProject`, one save at a time (UX design
 * §4.3). The screen shows the record it holds at once, saved or not; if a
 * save fails, the change stays on screen and `saveFailed` says so. A new
 * `loaded` record, such as the project opened again, replaces it.
 */
export function useProjectEdits(loaded: ProjectRecord): ProjectEdits {
  const [held, setHeld] = useState<HeldRecord>({ loaded, record: loaded });
  // Starting again from a new loaded record, during render, as React's
  // "adjusting state when a prop changes" pattern does.
  if (held.loaded !== loaded) setHeld({ loaded, record: loaded });
  const record = held.loaded === loaded ? held.record : loaded;

  // The latest record, for a command made before React renders the last.
  const latest = useRef(record);
  useLayoutEffect(() => {
    latest.current = record;
  }, [record]);

  const { queue, saveFailed } = useSaveQueue();

  const edit = useCallback(
    (command: EditCommand) => {
      const next = command(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      setHeld({ loaded, record: next });
      queue.save(next);
    },
    [loaded, queue],
  );
  return { record, edit, saveFailed, retry: queue.retry };
}

/** A screen's save queue, and whether its last save failed. */
interface SaveQueueState {
  readonly queue: SaveQueue;
  readonly saveFailed: boolean;
}

/**
 * One save queue for the screen's life, over `saveProject`. A save that
 * the use case refuses, or that throws, counts as failed.
 */
function useSaveQueue(): SaveQueueState {
  const { saveProject } = useUseCases();
  const [saveFailed, setSaveFailed] = useState(false);
  const [queue] = useState<SaveQueue>(() =>
    createSaveQueue({
      save: (record) =>
        saveProject.execute(record).then(
          (result) => result.status === "saved",
          () => false,
        ),
      onFailedChange: setSaveFailed,
    }),
  );
  return { queue, saveFailed };
}
