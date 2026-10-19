import type { ProjectRecord } from "../../application/ports/project-record";
import { ScreenHeading } from "../shared/ScreenHeading";
import { RunPanel } from "../run/RunPanel";
import { ArchitectureView } from "./ArchitectureView";

export interface OpenedProjectProps {
  readonly record: ProjectRecord;
}

/** A project that opened: its name, description, architecture, and runs. */
export function OpenedProject({ record }: OpenedProjectProps) {
  const { project } = record;
  return (
    <div>
      <ScreenHeading>{project.name}</ScreenHeading>
      {project.description && <p>{project.description}</p>}
      <ArchitectureView record={record} />
      <RunPanel project={project} />
    </div>
  );
}
