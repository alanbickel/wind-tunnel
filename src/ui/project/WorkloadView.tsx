import type { WorkloadDetails } from "../../application/details/details";
import type { Edit } from "./useProjectEdits";
import { WorkloadValueFields } from "./fields/WorkloadValueFields";
import { MixSection } from "./MixSection";
import { ProfileSection } from "./ProfileSection";

export interface WorkloadViewProps {
  readonly details: WorkloadDetails;
  /** Saves a change to the duration, the seed, the mix, or the profile. */
  readonly onEdit: (edit: Edit) => void;
  readonly announce: (message: string) => void;
}

/**
 * A workload: its duration and seed as fields, then its mix, and its
 * profile with a chart of it, all edited in place (UX design §2.7). Each
 * issue is said on the row it belongs to, or on its section's own.
 */
export function WorkloadView({ details, onEdit, announce }: WorkloadViewProps) {
  return (
    <div>
      <WorkloadValueFields
        details={details}
        onEdit={onEdit}
        announce={announce}
      />
      <MixSection details={details} onEdit={onEdit} announce={announce} />
      <ProfileSection details={details} onEdit={onEdit} announce={announce} />
    </div>
  );
}
