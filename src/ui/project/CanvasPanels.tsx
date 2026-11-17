import type { ZoomActions } from "../diagram/zoom-actions";
import { ZoomButtons } from "../diagram/ZoomButtons";
import styles from "./CanvasPanels.module.css";
import { WorkflowPicker, type WorkflowPickerProps } from "./WorkflowPicker";
import { type CanvasPanels as PanelState } from "./useCanvasPanels";

export interface CanvasPanelsProps {
  readonly panels: PanelState;
  /** The workflow picker's project, selection, and what it selects and clears. */
  readonly picker: Omit<WorkflowPickerProps, "onOpen">;
  /** The diagram's zoom actions, once it has loaded. */
  readonly zoom: ZoomActions | undefined;
}

/**
 * One row at the canvas's bottom left: the workflow picker, and zoom out,
 * zoom in, and fit. Opening the picker closes the tool rail's open panel.
 * (The components, connections, and their text version are the dock's
 * Components tab; the workflows list is on the tool rail, and the workloads
 * are the dock's Workloads tab.)
 */
export function CanvasPanels({ panels, picker, zoom }: CanvasPanelsProps) {
  return (
    <div className={styles.corner}>
      <div className={styles.buttons}>
        <WorkflowPicker {...picker} onOpen={panels.close} />
        <ZoomButtons zoom={zoom} />
      </div>
    </div>
  );
}
