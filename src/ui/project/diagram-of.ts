import type {
  Layout,
  ProjectRecord,
} from "../../application/ports/project-record";
import type { Component } from "../../domain/model/project";
import type {
  DiagramContent,
  DiagramNode,
  DiagramPoint,
} from "../diagram/diagram-model";

/** Spacing for components the layout doesn't place. */
const SPARE_COLUMN_WIDTH_PX = 250;
const SPARE_ROW_GAP_PX = 150;

/**
 * A project's architecture as a diagram: a node per component, at its place
 * in the layout, and an arrow per edge. Components the layout doesn't place
 * go in a row of their own under all the others, so they're still shown.
 */
export function diagramOf({ project, layout }: ProjectRecord): DiagramContent {
  const { components, edges } = project.architecture;
  const spareRowY = spareRowYOf(layout);
  const unplaced = components.filter((c) => !Object.hasOwn(layout.nodes, c.id));
  const positionOf = (component: Component): DiagramPoint =>
    layout.nodes[component.id] ?? {
      x: unplaced.indexOf(component) * SPARE_COLUMN_WIDTH_PX,
      y: spareRowY,
    };
  return {
    nodes: components.map((component) =>
      nodeOf({ component, position: positionOf(component) }),
    ),
    edges: edges.map(({ id, from, to }) => ({ id, source: from, target: to })),
  };
}

interface NodeOfInput {
  readonly component: Component;
  readonly position: DiagramPoint;
}

function nodeOf({ component, position }: NodeOfInput): DiagramNode {
  return {
    id: component.id,
    label: component.name,
    caption: component.type,
    position,
  };
}

/** Just below the lowest placed component, or 0 if none is placed. */
function spareRowYOf(layout: Layout): number {
  const ys = Object.values(layout.nodes).map((point) => point.y);
  if (ys.length === 0) return 0;
  return Math.max(...ys) + SPARE_ROW_GAP_PX;
}
