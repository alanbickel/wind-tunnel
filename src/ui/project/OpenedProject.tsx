import type { ProjectRecord } from "../../application/ports/project-record";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
}

/** A project that opened: its name, description, and what it's made of. */
export function OpenedProject({ record }: OpenedProjectProps) {
  const { project } = record;
  return (
    <div>
      <h2>{project.name}</h2>
      {project.description && <p>{project.description}</p>}
      <p>
        Components: {project.architecture.components.length} · Workflows:{" "}
        {project.workflows.length}
      </p>
    </div>
  );
}
