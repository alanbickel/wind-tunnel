import type { ProfilePoint } from "../../domain/model/project";

/** A workload's profile, and how long its run lasts. */
export interface ProfileNotesInput {
  readonly profile: readonly ProfilePoint[];
  readonly durationMs: number;
}

/**
 * A note for each profile point past the run's end, aligned with
 * `profile`; undefined for a point the run reaches. A point exactly at the
 * end is the end of the line, not past it, so it has no note.
 */
export function profileNotes({
  profile,
  durationMs,
}: ProfileNotesInput): (string | undefined)[] {
  const end = secondsText(durationMs);
  return profile.map(({ atMs }) =>
    atMs > durationMs
      ? `After the run's end (${end}). Arrivals follow the line toward this point, and the run stops at ${end}.`
      : undefined,
  );
}

/** A time in the seconds users read, e.g. "45 s". */
function secondsText(timeMs: number): string {
  return `${String(timeMs / 1000)} s`;
}
