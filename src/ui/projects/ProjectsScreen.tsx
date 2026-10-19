import { useCallback } from "react";
import type { ProjectSummary } from "../../application/ports/project-record";
import { useUseCases } from "../app/useUseCases";
import { LoadableView } from "../shared/LoadableView";
import { useLoad } from "../shared/useLoad";
import { NewFromTemplate } from "./NewFromTemplate";
import { ProjectList } from "./ProjectList";
import styles from "./ProjectsScreen.module.css";

export interface ProjectsScreenProps {
  readonly onOpen: (project: ProjectSummary) => void;
  /** Called after each project is created and saved. */
  readonly onCreated?: () => void;
  /** The project whose button gets focus once the list loads, if any. */
  readonly focusId?: string;
}

/** The first screen: the user's projects, and new ones from templates. */
export function ProjectsScreen({
  onOpen,
  onCreated,
  focusId,
}: ProjectsScreenProps) {
  const { listProjects } = useUseCases();
  const load = useCallback(() => listProjects.execute(), [listProjects]);
  const { loadable, reload } = useLoad(load);
  const created = useCallback(() => {
    reload();
    onCreated?.();
  }, [reload, onCreated]);

  return (
    <div className={styles.screen}>
      <section aria-labelledby="projects-heading">
        <h2 id="projects-heading">Your projects</h2>
        <LoadableView loadable={loadable} what="your projects">
          {(projects) => (
            <ProjectList
              projects={projects}
              onOpen={onOpen}
              focusId={focusId}
            />
          )}
        </LoadableView>
      </section>
      <NewFromTemplate onCreated={created} />
    </div>
  );
}
