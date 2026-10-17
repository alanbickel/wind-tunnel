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
 * in the layout, and an arrow per edge. A component the layout doesn't place
 * goes in a row under all the others, so it's still shown.
 */
export function diagramOf({ project, layout }: ProjectRecord): DiagramContent {
  const { components, edges } = project.architecture;
  const spareRowY = spareRowYOf(layout);
  const positionOf = (component: Component, index: number): DiagramPoint =>
    layout.nodes[component.id] ?? {
      x: index * SPARE_COLUMN_WIDTH_PX,
      y: spareRowY,
    };
  return {
    nodes: components.map((component, index) =>
      nodeOf({ component, position: positionOf(component, index) }),
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
