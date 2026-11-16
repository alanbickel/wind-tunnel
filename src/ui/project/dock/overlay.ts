import type { ComponentType } from "react";
import type { ProjectRecord } from "../../../application/ports/project-record";
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
  readonly record: ProjectRecord;
  readonly project: Project;
  readonly projectRun: ProjectRun;
  readonly selecting: ProjectSelection;
  readonly onEdit: ProjectEdits["edit"];
  readonly onRemove: AddAndRemove["remove"];
  /** The Components tab's list, where the focus goes after a remove. */
  readonly listRef: AddAndRemove["componentsListRef"];
  /** What a component's or a connection's remove says: "Removed Table." */
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
