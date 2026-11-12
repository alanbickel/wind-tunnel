import type { WorkloadDetails } from "../../application/details/details";
import type { ProfileEditing } from "./profile-editing";
import { useProfileFocus } from "./useProfileFocus";
import type { Edit } from "./useProjectEdits";

/** What a workload's profile section is given to save changes and say things. */
export interface ProfileEditingInput {
  readonly details: WorkloadDetails;
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
}

/** What every part of the section needs: the workload, its rows, and the focus. */
export function useProfileEditing({
  details,
  onEdit,
  announce,
}: ProfileEditingInput): ProfileEditing {
  const focus = useProfileFocus();
  const { profile, workloadId, name } = details;
  return {
    workloadId,
    workloadName: name,
    rows: profile.rows,
    onEdit,
    announce,
    focus,
  };
}
