import { SelectionDetails } from "../SelectionDetails";
import type { OverlayProps } from "./overlay";

/**
 * The dock's workload overlay: the selected workload's editor, with its
 * heading, Remove, Close, and Escape. Close and Escape clear the
 * selection, which takes the overlay's tab away. Drawn afresh for each
 * workload, so one's draft never shows in another's editor.
 */
export function WorkloadOverlay(props: OverlayProps) {
  const { project, selecting, onEdit, onRemove } = props;
  const { selection, selectWithin, close, takeFocus } = selecting;
  if (selection?.kind !== "workload") return null;
  return (
    <SelectionDetails
      key={selection.workloadId}
      project={project}
      selection={selection}
      onEdit={onEdit}
      onRemove={onRemove}
      onSelect={selectWithin}
      onClose={close}
      takeFocus={takeFocus}
      closable
    />
  );
}
