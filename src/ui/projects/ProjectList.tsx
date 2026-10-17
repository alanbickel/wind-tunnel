import type { ProjectSummary } from "../../application/ports/project-record";
import { useFocusOnMount } from "../shared/useFocusOnMount";

export interface ProjectListProps {
  readonly projects: readonly ProjectSummary[];
  readonly onOpen: (id: string) => void;
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
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <button
            ref={project.id === focusId ? focusRef : undefined}
            type="button"
            onClick={() => {
              onOpen(project.id);
            }}
          >
            {project.name}
          </button>{" "}
          <small>updated {new Date(project.updatedAt).toLocaleString()}</small>
          {project.description && <p>{project.description}</p>}
        </li>
      ))}
    </ul>
  );
}
