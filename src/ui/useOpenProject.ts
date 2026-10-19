import { useState } from "react";
import type { ProjectSummary } from "../application/ports/project-record";

export interface OpenProjectState {
  /** The project on screen; undefined while the project list shows. */
  readonly opened: ProjectSummary | undefined;
  /** The project the user last had open, so the list can focus it again. */
  readonly lastOpenedId: string | undefined;
  readonly open: (project: ProjectSummary) => void;
  /** Back to the project list. */
  readonly close: () => void;
}

/** Which project is open, and which was open last. */
export function useOpenProject(): OpenProjectState {
  const [opened, setOpened] = useState<ProjectSummary>();
  const [lastOpenedId, setLastOpenedId] = useState<string>();

  const open = (project: ProjectSummary) => {
    setOpened(project);
    setLastOpenedId(project.id);
  };
  const close = () => {
    setOpened(undefined);
  };
  return { opened, lastOpenedId, open, close };
}
