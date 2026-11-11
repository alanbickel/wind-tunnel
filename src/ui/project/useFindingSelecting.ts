import { useMemo } from "react";
import type { Project } from "../../domain/model/project";
import type { FindingSelecting } from "../run/finding-selecting";
import type { ProjectSelection } from "./useSelection";

/** What the run's findings read of the screen's selection. */
export function useFindingSelecting(
  project: Project,
  selecting: ProjectSelection,
): FindingSelecting {
  const { selection, selectFinding, clear } = selecting;
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
