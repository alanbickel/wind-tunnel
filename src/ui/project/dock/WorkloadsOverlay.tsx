import { useId, useMemo } from "react";
import type { Edit } from "../useProjectEdits";
import type { Project } from "../../../domain/model/project";
import { useUseCases } from "../../app/useUseCases";
import { useAnnouncement } from "../../shared/useAnnouncement";
import { WorkloadList } from "../WorkloadList";
import { WorkloadView } from "../WorkloadView";
import type { OverlayProps } from "./overlay";
import styles from "./ListBesideEditor.module.css";

/**
 * The dock's Workloads tab, always there (UX design §8): the workloads on
 * its left, with "Add workload" and each one's problems, and the open
 * workload's editor on its right. A workload opens here as it's selected,
 * from its row or anywhere else, and stays open while something else is
 * selected (rule 3); nothing closes it but its remove. With none open, the
 * editor's place says what a workload is.
 */
export function WorkloadsOverlay(props: OverlayProps) {
  const { project, selecting, addingWorkload } = props;
  return (
    <div className={styles.tab}>
      <div className={styles.list}>
        <WorkloadList
          project={project}
          selection={selecting.selection}
          onSelect={selecting.select}
          adding={addingWorkload}
        />
      </div>
      <OpenWorkload {...props} />
    </div>
  );
}

/**
 * The open workload's editor, keyed by the workload, so one's draft never
 * shows in another's; or, with none open (none selected yet, or the open
 * one gone), what a workload is, once there's one to open.
 */
function OpenWorkload({ project, selecting, onEdit }: OverlayProps) {
  const { openWorkloadId } = selecting;
  const open = project.workloads.find((w) => w.id === openWorkloadId);
  if (open !== undefined) {
    return (
      <WorkloadEditor
        key={open.id}
        project={project}
        workloadId={open.id}
        onEdit={onEdit}
      />
    );
  }
  // With no workloads, the list already says what one is.
  if (project.workloads.length === 0) return null;
  return (
    <p className={styles.none}>
      A workload says how much traffic your workflows get, and for how long.
      Select one to edit it.
    </p>
  );
}

interface WorkloadEditorProps {
  readonly project: Project;
  readonly workloadId: string;
  /** Saves a change to the duration, the seed, the mix, or the profile. */
  readonly onEdit: (edit: Edit) => void;
}

/**
 * One workload's editor, a region named by its heading, the workload's
 * name: its duration and seed, its mix and what it sends, and its profile.
 * Its name, problems, and Remove are the inspector's. A field's message
 * is said in its own polite region.
 */
function WorkloadEditor({ project, workloadId, onEdit }: WorkloadEditorProps) {
  const { describeSelection } = useUseCases();
  const details = useMemo(
    () =>
      describeSelection.execute({
        project,
        selection: { kind: "workload", workloadId },
      }),
    [describeSelection, project, workloadId],
  );
  const [announcement, announce] = useAnnouncement();
  const headingId = useId();
  if (details?.kind !== "workload") return null;
  return (
    <section aria-labelledby={headingId} className={styles.editor}>
      <h4 id={headingId} className={styles.heading}>
        {details.name}
      </h4>
      <WorkloadView details={details} onEdit={onEdit} announce={announce} />
      {/* On the page from the start, empty, so a screen reader announces
          a message put in it. */}
      <p role="status" className={styles.announcement}>
        {announcement}
      </p>
    </section>
  );
}
