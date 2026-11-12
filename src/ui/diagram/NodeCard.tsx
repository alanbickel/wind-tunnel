import {
  OUT_OF_DATE_NOTE,
  type DiagramNode,
  type DiagramStatus,
} from "./diagram-model";
import { ComponentIcon } from "./ComponentIcon";
import styles from "./NodeCard.module.css";

/**
 * A box's content: the type's icon, the name, the type in words, and after
 * a run a badge saying how the component did.
 */
export function NodeCard({ node }: { readonly node: DiagramNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.heading}>
        <ComponentIcon type={node.icon} />
        <div className={styles.text}>
          <strong className={styles.name}>{node.label}</strong>
          <small className={styles.type}>{node.caption}</small>
        </div>
      </div>
      {node.status && <StatusBadge status={node.status} />}
    </div>
  );
}

/**
 * The status as a shape and a word: a circle for ok, a triangle for waited,
 * a square for refused. From an earlier version of the project, the shape is
 * hollow and the border dashed, and a screen reader hears why.
 */
function StatusBadge({ status }: { readonly status: DiagramStatus }) {
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

const SHAPES: Readonly<Record<DiagramStatus["kind"], React.JSX.Element>> = {
  ok: <circle cx="5" cy="5" r="4" />,
  waited: <polygon points="5,1 9,9 1,9" />,
  refused: <rect x="1" y="1" width="8" height="8" />,
};
