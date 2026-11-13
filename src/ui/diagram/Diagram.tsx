import { lazy, Suspense } from "react";
import { LoadFailureBoundary } from "../shared/load-failure-boundary";
import styles from "./Diagram.module.css";
import type {
  DiagramConnection,
  DiagramContent,
  DiagramItem,
  DiagramMarks,
  DiagramMove,
} from "./diagram-model";
import type { ZoomActions } from "./zoom-actions";

// React Flow arrives in its own chunk the first time a diagram draws, so the
// project list loads without it (#16).
const DiagramCanvas = lazy(() =>
  import("./DiagramCanvas").then((module) => ({
    default: module.DiagramCanvas,
  })),
);

export interface DiagramProps {
  readonly content: DiagramContent;
  /** Names the diagram for screen readers, e.g. "Architecture of Checkout". */
  readonly label: string;
  /**
   * The nodes and edges to mark as selected, and those on a path, such as
   * a workflow's; none if not given.
   */
  readonly marks?: DiagramMarks | undefined;
  /**
   * Called with the node or edge the user clicks, or a node they press
   * Enter on, and with undefined when they click the empty canvas. Without
   * it, nothing on the diagram can be selected or tabbed to.
   */
  readonly onSelect?: ((item: DiagramItem | undefined) => void) | undefined;
  /**
   * Called with the arrow the user draws, by dragging from a box's right
   * edge to another box. Without it, nothing can be connected. The
   * diagram refuses an arrow from a box to itself, or a second one the
   * same way, before it's reported.
   */
  readonly onConnect?: ((connection: DiagramConnection) => void) | undefined;
  /**
   * Called with a box the user moves and where they put it: once when a
   * drag ends, and once for a run of arrow key presses on a focused box,
   * when the keys pause or the box loses the focus. The box stays where it
   * was put until `content` changes, which should then hold the move.
   * Without it, nothing can be moved.
   */
  readonly onMove?: ((move: DiagramMove) => void) | undefined;
  /**
   * How wide, in pixels, what floats over the diagram's right edge is, such
   * as an inspector: fitting the diagram keeps the boxes clear of it. None
   * if not given.
   */
  readonly coveredRightPx?: number | undefined;
  /**
   * Called with the actions that zoom out, zoom in, and fit the diagram
   * once it has loaded, and with undefined if it goes. The diagram draws no
   * zoom controls of its own; `ZoomButtons` draws them wherever the screen
   * puts them.
   */
  readonly onZoom?: ((zoom: ZoomActions | undefined) => void) | undefined;
}

/**
 * A diagram of boxes and arrows (ADR-0010). The user can pan and zoom.
 * Given `onMove`, they can move a box by dragging it, or with the arrow
 * keys once it has the focus. Given `onConnect`, a drag from one box's
 * handle to another draws an arrow. Given `onSelect`, a click
 * selects a box or an arrow, and the boxes take tab stops so Enter can
 * select them; the diagram rings the selected boxes and thickens the
 * selected arrows. A path's boxes get a thick border inside their edge, and
 * its arrows a thick line, so a path reads apart from the selection; what's
 * off the path fades, and its arrows carry the call numbers given. It
 * isn't readable by screen readers, so pair it with a text version that
 * can select the same things. It has no border, so it can fill a screen
 * edge to edge, with its zoom actions reported through `onZoom`. Place it
 * in a flex column: it's `--diagram-height` tall, or it fills the room a
 * fixed-height column leaves it, and refits when that room changes. While
 * React Flow loads, or if it can't, the box holds its place. It fits the
 * boxes in, at most at their own size, clear of a covered right edge.
 */
export function Diagram(props: DiagramProps) {
  const { content, label, marks, onSelect, onConnect, onMove, ...rest } = props;
  return (
    <div role="group" aria-label={label} className={styles.diagram}>
      <div className={styles.canvas}>
        <LoadFailureBoundary
          failure={
            <p className={styles.standIn}>
              Couldn't load the diagram. Reload the page to try again.
            </p>
          }
        >
          <Suspense
            fallback={<p className={styles.standIn}>Loading the diagram…</p>}
          >
            <DiagramCanvas
              content={content}
              marks={marks}
              onSelect={onSelect}
              onConnect={onConnect}
              onMove={onMove}
              coveredRightPx={rest.coveredRightPx}
              onZoom={rest.onZoom}
            />
          </Suspense>
        </LoadFailureBoundary>
      </div>
    </div>
  );
}
