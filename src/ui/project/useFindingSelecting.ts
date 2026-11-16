import { useMemo } from "react";
import type { Project } from "../../domain/model/project";
import type { FindingSelecting } from "../run/finding-selecting";
import type { ProjectSelection } from "./useSelection";

/**
 * What the run's findings read of the screen's selection. Escape on a
 * finding closes it, as × does, so the overview shows and the focus goes
 * back to what selected the run, or to the overview's heading.
 */
export function useFindingSelecting(
  project: Project,
  selecting: ProjectSelection,
): FindingSelecting {
  const { selection, selectFinding, close: clear } = selecting;
  const selected = selection?.kind === "finding" ? selection.key : undefined;
  return useMemo(
    () => ({
      selected,
      onSelect: selectFinding,
      onClear: clear,
      isGone: ({ componentId }) =>
        !project.architecture.components.some((c) => c.id === componentId),
    }),
    [project, selected, selectFinding, clear],
  );
}
