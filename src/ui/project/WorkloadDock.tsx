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
 * draft survives. Any selection of a workload, the same one again too,
 * opens it unfolded, so the focus request has a heading to reach.
 */
export function WorkloadDock(props: WorkloadDockProps) {
  const { selection } = props.selecting;
  const [folded, setFolded] = useState(false);
  const [seen, setSeen] = useState(selection);
  if (seen !== selection) {
    setSeen(selection);
    setFolded(false);
  }
  if (selection?.kind !== "workload") return null;
  return (
    <Dock
      key={selection.workloadId}
      {...props}
      selection={selection}
      folded={folded}
      onFold={setFolded}
    />
  );
}

interface DockProps extends WorkloadDockProps {
  readonly selection: Selection;
  readonly folded: boolean;
  readonly onFold: (folded: boolean) => void;
}

function Dock(props: DockProps) {
  const { project, selection, selecting, onEdit, onRemove } = props;
  const { folded, onFold } = props;
  const bodyId = useId();
  const { selectWithin, close, takeFocus } = selecting;
  return (
    <section aria-label="Workload dock" className={styles.dock}>
      <FoldButton
        folded={folded}
        controls={bodyId}
        onToggle={() => {
          onFold(!folded);
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
