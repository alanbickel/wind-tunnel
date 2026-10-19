import type { ProjectSummary } from "../../application/ports/project-record";
import { Button } from "../shared/Button";
import { Card, CardList } from "../shared/CardList";
import { useFocusOnMount } from "../shared/useFocusOnMount";
import styles from "./ProjectList.module.css";

export interface ProjectListProps {
  readonly projects: readonly ProjectSummary[];
  readonly onOpen: (project: ProjectSummary) => void;
  /** The project whose button gets focus, e.g. the one the user just closed. */
  readonly focusId: string | undefined;
}

/** The user's saved projects, newest first, each one a button that opens it. */
export function ProjectList({ projects, onOpen, focusId }: ProjectListProps) {
  const focusRef = useFocusOnMount<HTMLButtonElement>();
  if (projects.length === 0) {
    return <p>No projects yet. Create one from a template below.</p>;
  }
  return (
    <CardList>
      {projects.map((project) => (
        <Card key={project.id}>
          <h3 className={styles.name}>
            <Button
              ref={project.id === focusId ? focusRef : undefined}
              variant="link"
              onClick={() => {
                onOpen(project);
              }}
            >
              {project.name}
            </Button>
          </h3>
          <p className={styles.updated}>
            Updated {new Date(project.updatedAt).toLocaleString()}
          </p>
          {project.description && <p>{project.description}</p>}
        </Card>
      ))}
    </CardList>
  );
}
