import type { ComponentType } from "react";
import type { ProjectRecord } from "../../../application/ports/project-record";
import type { Project } from "../../../domain/model/project";
import type { ProjectRun } from "../../run/useProjectRun";
import type { AddAndRemove } from "../useAddAndRemove";
import type { ProjectEdits } from "../useProjectEdits";
import type { ProjectSelection } from "../useSelection";
import type { AddWorkloadProps } from "../WorkloadList";

/**
 * What every overlay reads, live from the screen: the run changes with
 * each deferred snapshot, and a workload as it's edited.
 */
export interface OverlayProps {
  readonly record: ProjectRecord;
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
  /** Adds a component of the type, selected with its name focused. */
  readonly onAdd: AddAndRemove["add"];
  /** The Components tab's list, where the focus goes after a remove. */
  readonly listRef: AddAndRemove["componentsListRef"];
  /** The Workloads tab's "Add workload", where a workload's remove sends the focus. */
  readonly addingWorkload: AddWorkloadProps;
  /**
   * What a component's, a connection's, or a workload's remove says:
   * "Removed Table."
   */
  readonly announcement: string;
}

/** One overlay the dock can show, in a tab of its own. */
export interface Overlay {
  /** Whether it has anything to show; the dock leaves its tab out if not. */
  readonly shows: (props: OverlayProps) => boolean;
  /** Its tab's label. */
  readonly label: (props: OverlayProps) => string;
  /** What draws it. */
  readonly Content: ComponentType<OverlayProps>;
}
