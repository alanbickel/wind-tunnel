import type { DiagramNode } from "./diagram-model";
import { ComponentIcon } from "./ComponentIcon";
import styles from "./NodeCard.module.css";
import { StatusBadge } from "./StatusBadge";

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
