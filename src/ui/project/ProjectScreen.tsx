import { useCallback, type ReactNode } from "react";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { useLoad } from "../shared/useLoad";
import { InvalidProject } from "./InvalidProject";
import { OpenedProject } from "./OpenedProject";
import { ScreenHeading } from "../shared/ScreenHeading";

export interface ProjectScreenProps {
  readonly id: string;
}

/** One saved project, or why it can't be opened. */
export function ProjectScreen({ id }: ProjectScreenProps) {
  const { openProject } = useUseCases();
  const load = useCallback(() => openProject.execute(id), [openProject, id]);
  const { loadable } = useLoad(load);

  return (
    <section>
      <LoadableView loadable={loadable} what="the project">
        {(lookup) =>
          handleStatus<ProjectLookup, ReactNode>(LOOKUP_VIEWS, lookup)
        }
      </LoadableView>
    </section>
  );
}

const LOOKUP_VIEWS: StatusHandlers<ProjectLookup, ReactNode> = {
  found: ({ record }) => <OpenedProject record={record} />,
  missing: () => (
    <>
      <ScreenHeading>Project not found</ScreenHeading>
      <p role="alert">This project no longer exists.</p>
    </>
  ),
  invalid: (lookup) => <InvalidProject lookup={lookup} />,
};
