import type { ReactNode } from "react";

// The diagram's own types (ADR-0010). Consumers describe a diagram in these
// terms; only this folder knows they become React Flow nodes and edges.

/** A position on the canvas, in pixels from the top left. */
export interface DiagramPoint {
  readonly x: number;
  readonly y: number;
}

/** What a box's status badge says, and how it's drawn. */
export type DiagramStatusKind = "refused" | "waited" | "ok";

/** A box's status badge: a shape and a word, never color alone. */
export interface DiagramStatus {
  readonly kind: DiagramStatusKind;
  /** The word on the badge, and its accessible name. */
  readonly word: string;
  /** Whether it's from a run of an earlier version of the project: drawn hollow. */
  readonly outOfDate: boolean;
}

/**
 * Said after a badge from a run of an earlier version of the project. Kept
 * here, not in `NodeCard`, so the text version can say it without loading
 * the icons, which belong to the lazy chunk.
 */
export const OUT_OF_DATE_NOTE = "from an earlier version of the project";

/** A box on the diagram, such as one component. */
export interface DiagramNode {
  readonly id: string;
  /** The main text, e.g. the component's name. */
  readonly label: string;
  /** Smaller text under the label, e.g. the component's type in words. */
  readonly caption: string;
  /** What picks the icon, e.g. the component's type ID; an unknown one has no icon. */
  readonly icon: string;
  /** How the box did in the run on screen; none with no run, or none for it. */
  readonly status?: DiagramStatus | undefined;
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

/**
 * What the diagram marks: the selection, ringed boxes and thickened
 * arrows, a path, such as a workflow's, drawn so it reads apart from the
 * selection, with everything off a path faded, and the numbers on the
 * path's arrows.
 */
export interface DiagramMarks {
  readonly selected: readonly DiagramItem[];
  /** With a path, whatever isn't on it is faded; with none, nothing is. */
  readonly path: readonly DiagramItem[];
  readonly numbers: readonly EdgeNumbers[];
}

/** The numbers shown on one arrow: each call along it, in the order made. */
export interface EdgeNumbers {
  readonly edgeId: string;
  readonly numbers: readonly number[];
}

/** No selection, no path, and no numbers. */
export const NO_MARKS: DiagramMarks = { selected: [], path: [], numbers: [] };

/** Whether `item` is among `items`: the same kind, and the same id. */
export function isAmong(
  items: readonly DiagramItem[],
  item: DiagramItem,
): boolean {
  return items.some((marked) => isSelected(marked, item));
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

/** A node the user moved, and where it ended up. */
export interface DiagramMove {
  readonly id: string;
  /** The box's new top left. */
  readonly position: DiagramPoint;
}

/**
 * What an arrow's offer asks the user, drawn in a popover at the arrow:
 * given a way to close the popover, whatever it shows. Closing it returns
 * the focus to the offer's button.
 */
export type OfferQuestion = (close: () => void) => ReactNode;

/**
 * An arrow's offer: a button at its middle that does something along that
 * arrow, such as adding a call to a workflow (UX design §7).
 */
export interface EdgeOffer {
  readonly edgeId: string;
  /** The button's name and its tooltip, e.g. "Add a call from fn-orders to orders-db". */
  readonly label: string;
  /**
   * Called when the user uses the button. Returns the question to ask in a
   * popover, or undefined when the offer needed to ask nothing and has done
   * its work.
   */
  readonly onUse: () => OfferQuestion | undefined;
}
