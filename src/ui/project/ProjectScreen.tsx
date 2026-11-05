import { useCallback, type ReactNode } from "react";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { useLoad } from "../shared/useLoad";
import { InvalidProject } from "./InvalidProject";
import { OpenedProject } from "./OpenedProject";
import { ScreenHeading } from "../shared/ScreenHeading";
import styles from "./ProjectScreen.module.css";

export interface ProjectScreenProps {
  readonly id: string;
  /** Follows the saved record's name, including after Undo and Redo. */
  readonly onProjectNameChange?: (name: string) => void;
}

/** One saved project, or why it can't be opened. */
export function ProjectScreen({ id, onProjectNameChange }: ProjectScreenProps) {
  const { openProject } = useUseCases();
  const load = useCallback(() => openProject.execute(id), [openProject, id]);
  const { loadable } = useLoad(load);

  return (
    <section className={styles.screen}>
      <LoadableView loadable={loadable} what="the project">
        {(lookup) =>
          handleStatus<ProjectLookup, ReactNode>(
            lookupViews(onProjectNameChange),
            lookup,
          )
        }
      </LoadableView>
    </section>
  );
}

function lookupViews(
  onProjectNameChange?: (name: string) => void,
): StatusHandlers<ProjectLookup, ReactNode> {
  return {
    found: ({ record }) => (
      <OpenedProject
        record={record}
        onProjectNameChange={onProjectNameChange}
      />
    ),
    missing: () => (
      <>
        <ScreenHeading>Project not found</ScreenHeading>
        <p role="alert">This project no longer exists.</p>
      </>
    ),
    invalid: (lookup) => <InvalidProject lookup={lookup} />,
  };
}
