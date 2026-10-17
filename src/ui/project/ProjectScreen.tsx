import { useCallback, type ReactNode } from "react";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { viewFor, type StatusViews } from "../shared/status-views";
import { useLoad } from "../shared/useLoad";
import { InvalidProject } from "./InvalidProject";
import { OpenedProject } from "./OpenedProject";

export interface ProjectScreenProps {
  readonly id: string;
  /** Goes back to the project list. */
  readonly onClose: () => void;
}

/** One saved project, or why it can't be opened. */
export function ProjectScreen({ id, onClose }: ProjectScreenProps) {
  const { openProject } = useUseCases();
  const load = useCallback(() => openProject.execute(id), [openProject, id]);
  const { loadable } = useLoad(load);

  return (
    <section>
      <button type="button" onClick={onClose}>
        ← All projects
      </button>
      <LoadableView loadable={loadable} what="the project">
        {(lookup) => viewFor<ProjectLookup, ReactNode>(LOOKUP_VIEWS, lookup)}
      </LoadableView>
    </section>
  );
}

const LOOKUP_VIEWS: StatusViews<ProjectLookup, ReactNode> = {
  found: ({ record }) => <OpenedProject record={record} />,
  missing: () => <p role="alert">This project no longer exists.</p>,
  invalid: (lookup) => <InvalidProject lookup={lookup} />,
};
