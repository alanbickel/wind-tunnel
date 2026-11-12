import type { MixRowDetails } from "../../application/details/details";
import type { MixFocus } from "./useMixFocus";
import type { Edit } from "./useProjectEdits";

/** What every part of the mix needs to save a change and move the focus. */
export interface MixEditing {
  readonly workloadId: string;
  readonly workloadName: string;
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
  readonly focus: MixFocus;
}

/**
 * A key for each row: its workflow's id, and for a stored mix that repeats a
 * workflow, the repeat's index too, so no two rows share one.
 */
export function rowKeys(rows: readonly MixRowDetails[]): string[] {
  const seen = new Set<string>();
  return rows.map(({ workflowId }, index) => {
    const key = seen.has(workflowId)
      ? `${workflowId}#${String(index)}`
      : workflowId;
    seen.add(workflowId);
    return key;
  });
}
