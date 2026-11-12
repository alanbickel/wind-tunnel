import type { ProfileRowDetails } from "../../application/details/details";
import type { ProfileFocus } from "./useProfileFocus";
import type { Edit } from "./useProjectEdits";

/**
 * A key for each row: its time, which names the point, and for a stored
 * profile that repeats a time, the repeat's count too, so no two rows share
 * one. A point that moves gets a new row, with a draft of its own: a row
 * kept by its place would carry the draft of whatever point was there.
 */
export function pointKeys(rows: readonly ProfileRowDetails[]): string[] {
  const seen = new Map<number, number>();
  return rows.map(({ atMs }) => {
    const count = seen.get(atMs) ?? 0;
    seen.set(atMs, count + 1);
    return `${String(atMs)}#${String(count)}`;
  });
}

/** What every part of the profile needs to save a change and move the focus. */
export interface ProfileEditing {
  readonly workloadId: string;
  readonly workloadName: string;
  /** The rows as drawn: every point, in the order the table shows them. */
  readonly rows: readonly ProfileRowDetails[];
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
  readonly focus: ProfileFocus;
}
