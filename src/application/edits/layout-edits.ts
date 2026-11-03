import type { Point, ProjectRecord } from "../ports/project-record";

// Layout commands (ADR-0019): like the component commands, each takes the
// project record and returns the next one. The layout isn't part of the
// `Project`, so a layout command never makes a run out of date (ADR-0018).

/** A component, and where on the canvas it goes. */
export interface MoveComponentInput {
  readonly componentId: string;
  /** The box's top left, in canvas pixels. */
  readonly position: Point;
}

/**
 * Puts a component at a position on the canvas, placing it if the layout
 * didn't. Returns the record unchanged, so nothing saves, if the component
 * is already there or the project doesn't have it.
 */
export function moveComponent(
  record: ProjectRecord,
  { componentId, position }: MoveComponentInput,
): ProjectRecord {
  const { project, layout } = record;
  if (!project.architecture.components.some((c) => c.id === componentId)) {
    return record;
  }
  if (samePoint(layout.nodes[componentId], position)) return record;
  const nodes = { ...layout.nodes, [componentId]: position };
  return { ...record, layout: { ...layout, nodes } };
}

function samePoint(point: Point | undefined, other: Point): boolean {
  return point?.x === other.x && point.y === other.y;
}
