import type { Project } from "../../domain/model/project";

/** The component's name, or its id if the project has no such component. */
export function nameOf(project: Project, componentId: string): string {
  return (
    project.architecture.components.find((c) => c.id === componentId)?.name ??
    componentId
  );
}
