import type { Edge, Project } from "../../domain/model/project";
import { stepsAlong } from "./called-by";
import type { EdgeDetails } from "./details";
import { EDGE_FIELDS } from "./fields/edge-fields";
import { settingValueText } from "./setting-text";

/**
 * An edge's details: the components it joins, by name, its settings as
 * their descriptors read them, and the steps that call along it. Edges
 * have no defaults yet (UX design §5), so no setting has a default note.
 */
export function edgeDetails(project: Project, edge: Edge): EdgeDetails {
  return {
    kind: "edge",
    sourceName: nameOf(project, edge.from),
    targetName: nameOf(project, edge.to),
    settings: EDGE_FIELDS.map((field) => ({
      key: field.key,
      label: field.label,
      value: settingValueText(field, edge[field.key]),
      help: field.help,
      defaultNote: undefined,
      editor: undefined,
    })),
    calledAlongBy: stepsAlong(project, edge),
  };
}

/** The component's name, or its id if the project has no such component. */
function nameOf(project: Project, componentId: string): string {
  return (
    project.architecture.components.find((c) => c.id === componentId)?.name ??
    componentId
  );
}
