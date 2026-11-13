import { useId, useState } from "react";
import type { Selection } from "../../application/details/selection";
import type { Project } from "../../domain/model/project";
import { Button } from "../shared/Button";
import styles from "./WorkloadDock.module.css";
import { SelectionDetails } from "./SelectionDetails";
import type { AddAndRemove } from "./useAddAndRemove";
import type { ProjectEdits } from "./useProjectEdits";
import type { ProjectSelection } from "./useSelection";

/** What the dock shows, and what it changes. */
export interface WorkloadDockProps {
  readonly project: Project;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
}

/**
 * The dock along the bottom of the canvas, as wide as the window. It holds
 * the selected workload's editor, and nothing when no workload is
 * selected; the run's timeline will share it (UX design §2, "The dock").
 * Fold shrinks it to one line and keeps the editor mounted, hidden, so a
 * draft survives. Selecting another workload opens it unfolded.
 */
export function WorkloadDock(props: WorkloadDockProps) {
  const { selection } = props.selecting;
  if (selection?.kind !== "workload") return null;
  return <Dock key={selection.workloadId} {...props} selection={selection} />;
}

interface DockProps extends WorkloadDockProps {
  readonly selection: Selection;
}

function Dock({ project, selection, selecting, onEdit, onRemove }: DockProps) {
  const [folded, setFolded] = useState(false);
  const bodyId = useId();
  const { selectWithin, close, takeFocus } = selecting;
  return (
    <section aria-label="Workload dock" className={styles.dock}>
      <FoldButton
        folded={folded}
        controls={bodyId}
        onToggle={() => {
          setFolded(!folded);
        }}
      />
      <div id={bodyId} hidden={folded} className={styles.body}>
        <SelectionDetails
          project={project}
          selection={selection}
          onEdit={onEdit}
          onRemove={onRemove}
          onSelect={selectWithin}
          onClose={close}
          takeFocus={takeFocus}
          closable
        />
      </div>
    </section>
  );
}

interface FoldButtonProps {
  readonly folded: boolean;
  readonly controls: string;
  readonly onToggle: () => void;
}

/** Folds the dock to this one line, or unfolds it. */
function FoldButton({ folded, controls, onToggle }: FoldButtonProps) {
  return (
    <div className={styles.bar}>
      <Button
        label={folded ? "Unfold the dock" : "Fold the dock"}
        expanded={!folded}
        controls={controls}
        onClick={onToggle}
      >
        {folded ? "Unfold" : "Fold"}
      </Button>
    </div>
  );
}
