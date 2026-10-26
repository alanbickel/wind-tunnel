import { lazy, Suspense } from "react";
import { LoadFailureBoundary } from "../shared/load-failure-boundary";
import styles from "./Diagram.module.css";
import type { DiagramContent, DiagramItem } from "./diagram-model";

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
  /** The node or edge to mark as selected, if any. */
  readonly selected?: DiagramItem | undefined;
  /**
   * Called with the node or edge the user clicks, or a node they press
   * Enter on, and with undefined when they click the empty canvas. Without
   * it, nothing on the diagram can be selected or tabbed to.
   */
  readonly onSelect?: ((item: DiagramItem | undefined) => void) | undefined;
}

/**
 * A read-only diagram of boxes and arrows (ADR-0010). The user can pan and
 * zoom, but not move or connect anything. Given `onSelect`, a click
 * selects a box or an arrow, and the boxes take tab stops so Enter can
 * select them; the diagram rings the selected box and thickens the
 * selected arrow. It isn't readable by screen readers, so pair it with a
 * text version that can select the same things. Place it in
 * a flex column, such as a `Panel`: it's `--diagram-height` tall, or it
 * fills the room a fixed-height column leaves it, and refits when that
 * room changes. While React Flow loads, or if it can't, the box holds its
 * place.
 */
export function Diagram({ content, label, selected, onSelect }: DiagramProps) {
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
              selected={selected}
              onSelect={onSelect}
            />
          </Suspense>
        </LoadFailureBoundary>
      </div>
    </div>
  );
}
