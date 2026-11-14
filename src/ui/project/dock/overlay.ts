import type { ComponentType } from "react";
import type { Project } from "../../../domain/model/project";
import type { ProjectRun } from "../../run/useProjectRun";
import type { AddAndRemove } from "../useAddAndRemove";
import type { ProjectEdits } from "../useProjectEdits";
import type { ProjectSelection } from "../useSelection";

/**
 * What every overlay reads, live from the screen: the run changes with
 * each deferred snapshot, and a workload as it's edited.
 */
export interface OverlayProps {
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
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
