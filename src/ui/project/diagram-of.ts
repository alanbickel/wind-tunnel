import type {
  Layout,
  ProjectRecord,
} from "../../application/ports/project-record";
import { STATUS_WORDS } from "../../application/run-analysis/component-status";
import type { Component } from "../../domain/model/project";
import type { RunBadges } from "../run/run-badges";
import type {
  DiagramContent,
  DiagramStatus,
  DiagramNode,
  DiagramPoint,
} from "../diagram/diagram-model";

/** Spacing for components the layout doesn't place. */
const SPARE_COLUMN_WIDTH_PX = 250;
const SPARE_ROW_GAP_PX = 150;

/** What a diagram draws besides the architecture. */
export interface DiagramOfOptions {
  /** A component type's name in words, e.g. "API Gateway" for `api-gateway`. */
  readonly displayNameOf: (type: string) => string;
  /** The run on screen's status badges; none to draw none. */
  readonly badges?: RunBadges | undefined;
}

/**
 * A project's architecture as a diagram: a node per component, at its place
 * in the layout, with its type in words and, after a run, its status badge;
 * and an arrow per edge. Components the layout doesn't place go in a row of
 * their own under all the others, so they're still shown.
 */
export function diagramOf(
  { project, layout }: ProjectRecord,
  options: DiagramOfOptions,
): DiagramContent {
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
      nodeOf({ component, position: positionOf(component), ...options }),
    ),
    edges: edges.map(({ id, from, to }) => ({ id, source: from, target: to })),
  };
}

interface NodeOfInput extends DiagramOfOptions {
  readonly component: Component;
  readonly position: DiagramPoint;
}

function nodeOf(input: NodeOfInput): DiagramNode {
  const { component, position, displayNameOf, badges } = input;
  return {
    id: component.id,
    label: component.name,
    caption: displayNameOf(component.type),
    icon: component.type,
    status: statusOf(component.id, badges),
    position,
  };
}

/** The component's badge, or undefined if there's no run or it has no status. */
function statusOf(
  componentId: string,
  badges: RunBadges | undefined,
): DiagramStatus | undefined {
  const kind = badges?.statuses.get(componentId);
  if (badges === undefined || kind === undefined) return undefined;
  return { kind, word: STATUS_WORDS[kind], outOfDate: badges.outOfDate };
}

/** Just below the lowest placed component, or 0 if none is placed. */
function spareRowYOf(layout: Layout): number {
  const ys = Object.values(layout.nodes).map((point) => point.y);
  if (ys.length === 0) return 0;
  return Math.max(...ys) + SPARE_ROW_GAP_PX;
}
