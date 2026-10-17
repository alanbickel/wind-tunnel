import type { ProjectSummary } from "../../application/ports/project-record";

export interface ProjectListProps {
  readonly projects: readonly ProjectSummary[];
  readonly onOpen: (id: string) => void;
}

/** The user's saved projects, newest first, each one a button that opens it. */
export function ProjectList({ projects, onOpen }: ProjectListProps) {
  if (projects.length === 0) {
    return <p>No projects yet. Create one from a template below.</p>;
  }
  return (
    <ul>
      {projects.map((project) => (
        <li key={project.id}>
          <button
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
