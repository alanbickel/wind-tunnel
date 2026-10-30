// The diagram's own types (ADR-0010). Consumers describe a diagram in these
// terms; only this folder knows they become React Flow nodes and edges.

/** A position on the canvas, in pixels from the top left. */
export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

/** A box on the diagram, such as one component. */
export interface DiagramNode {
  readonly id: string;
  /** The main text, e.g. the component's name. */
  readonly label: string;
  /** Smaller text under the label, e.g. the component's type. */
  readonly caption: string;
  readonly position: DiagramPoint;
}

/** An arrow from one node to another. */
export interface DiagramEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
}

/** Everything a `Diagram` shows. */
export interface DiagramContent {
  readonly nodes: readonly DiagramNode[];
  readonly edges: readonly DiagramEdge[];
}

/** What can be selected on a diagram: a box or an arrow. */
export type DiagramItemKind = "node" | "edge";

/** A node or an edge, by its id. */
export interface DiagramItem {
  readonly kind: DiagramItemKind;
  readonly id: string;
}

/** Whether `item` is the selected one: the same kind, and the same id. */
export function isSelected(
  selected: DiagramItem | undefined,
  item: DiagramItem,
): boolean {
  return selected?.kind === item.kind && selected.id === item.id;
}

/** An arrow the user draws, from one node to another. */
export interface DiagramConnection {
  readonly source: string;
  readonly target: string;
}

/**
 * Whether `connection` may be drawn: not from a node to itself, and not a
 * second arrow from the same node to the same node.
 */
export function canConnect(
  edges: readonly DiagramEdge[],
  { source, target }: DiagramConnection,
): boolean {
  if (source === target) return false;
  return !edges.some((e) => e.source === source && e.target === target);
}
