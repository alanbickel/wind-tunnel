import { useCallback, type ReactNode } from "react";
import type { ProjectRecord } from "../../application/ports/project-record";
import type { ProjectLookup } from "../../application/ports/project-repository";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { handleStatus, type StatusHandlers } from "../shared/status-handlers";
import { useLoad, type Loadable } from "../shared/useLoad";
import { InvalidProject } from "./InvalidProject";
import { OpenedProject } from "./OpenedProject";
import { ProjectFrame, type ShellParts } from "./ProjectFrame";
import { ScreenHeading } from "../shared/ScreenHeading";
import styles from "./ProjectScreen.module.css";

export interface ProjectScreenProps {
  readonly id: string;
  /** The project's name as the list had it, for the breadcrumb while it opens. */
  readonly name: string;
  readonly shell: ShellParts;
  /** Follows the saved record's name, including after Undo and Redo. */
  readonly onProjectNameChange?: (name: string) => void;
}

/**
 * One saved project, or why it can't be opened. An opened project draws
 * its own frame, since its controls sit in the top bar; until then, the
 * frame holds what's happening.
 */
export function ProjectScreen(props: ProjectScreenProps) {
  const { id, name, shell, onProjectNameChange } = props;
  const { openProject } = useUseCases();
  const load = useCallback(() => openProject.execute(id), [openProject, id]);
  const { loadable } = useLoad(load);
  const record = foundRecord(loadable);

  if (record !== undefined) {
    return (
      <OpenedProject
        record={record}
        shell={shell}
        onProjectNameChange={onProjectNameChange}
      />
    );
  }
  return (
    <ProjectFrame shell={shell} current={name}>
      <section className={styles.screen}>
        <LoadableView loadable={loadable} what="the project">
          {(lookup) =>
            handleStatus<ProjectLookup, ReactNode>(LOOKUP_VIEWS, lookup)
          }
        </LoadableView>
      </section>
    </ProjectFrame>
  );
}

/** The record, once the project has loaded and was found. */
function foundRecord(
  loadable: Loadable<ProjectLookup>,
): ProjectRecord | undefined {
  if (loadable.status !== "loaded") return undefined;
  const lookup = loadable.value;
  return lookup.status === "found" ? lookup.record : undefined;
}

/** Why a project didn't open; a found one draws itself. */
const LOOKUP_VIEWS: StatusHandlers<ProjectLookup, ReactNode> = {
  found: () => null,
  missing: () => (
    <>
      <ScreenHeading>Project not found</ScreenHeading>
      <p role="alert">This project no longer exists.</p>
    </>
  ),
  invalid: (lookup) => <InvalidProject lookup={lookup} />,
};
