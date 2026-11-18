import type { JSX } from "react";
import { OUT_OF_DATE_NOTE, type DiagramStatus } from "./diagram-model";
import styles from "./StatusBadge.module.css";

/**
 * The status as a shape and words: a circle for ok, a triangle for waited,
 * a square for refused. From an earlier version of the project, the shape is
 * hollow and the border dashed, and a screen reader hears why. A box's card
 * draws it, and so does a component's In this run, so the two look and read
 * the same.
 */
export function StatusBadge({ status }: { readonly status: DiagramStatus }) {
  return (
    <span
      className={styles.badge}
      data-status={status.kind}
      data-out-of-date={status.outOfDate || undefined}
    >
      <svg viewBox="0 0 10 10" className={styles.shape} aria-hidden="true">
        {SHAPES[status.kind]}
      </svg>
      {status.word}
      {status.outOfDate && (
        <span className={styles.note}>, {OUT_OF_DATE_NOTE}</span>
      )}
    </span>
  );
}

const SHAPES: Readonly<Record<DiagramStatus["kind"], JSX.Element>> = {
  ok: <circle cx="5" cy="5" r="4" />,
  waited: <polygon points="5,1 9,9 1,9" />,
  refused: <rect x="1" y="1" width="8" height="8" />,
};
