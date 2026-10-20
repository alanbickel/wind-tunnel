import { lazy, Suspense } from "react";
import styles from "./Diagram.module.css";
import type { DiagramContent } from "./diagram-model";

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
}

/**
 * A read-only diagram of boxes and arrows (ADR-0010). The user can pan and
 * zoom, but not move, connect, select, or tab to anything. It isn't
 * readable by screen readers, so pair it with a text version. Place it in
 * a flex column, such as a `Panel`: it's `--diagram-height` tall, or it
 * fills the room a fixed-height column leaves it, and refits when that
 * room changes. While React Flow loads, the box holds its place.
 */
export function Diagram({ content, label }: DiagramProps) {
  return (
    <div role="group" aria-label={label} className={styles.diagram}>
      <div className={styles.canvas}>
        <Suspense
          fallback={<p className={styles.loading}>Loading the diagram…</p>}
        >
          <DiagramCanvas content={content} />
        </Suspense>
      </div>
    </div>
  );
}
