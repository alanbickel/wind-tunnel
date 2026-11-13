import type { MixRowDetails } from "../../application/details/details";
import { seriesToken } from "./series-token";
import styles from "./MixBar.module.css";

export interface MixBarProps {
  readonly rows: readonly MixRowDetails[];
}

/**
 * The mix's split as one bar above its rows (UX design §8): a segment for
 * each workflow, as wide as its share, in the colour its row's swatch wears.
 * The shares stay in the rows as text, so colour isn't the only signal, and
 * the bar says the same in words for a screen reader. Nothing when no entry
 * has a share to draw.
 */
export function MixBar({ rows }: MixBarProps) {
  const shared = rows.filter((row) => row.shareTenths !== undefined);
  if (shared.length === 0) return null;
  const alternative = shared
    .map((row) => `${row.workflowName} ${row.shareText ?? ""}`)
    .join(", ");
  return (
    <div
      role="img"
      aria-label={`Mix split: ${alternative}`}
      className={styles.bar}
    >
      {shared.map((row, index) => (
        <span
          key={`${row.workflowId}-${String(index)}`}
          className={styles.segment}
          style={{
            flexGrow: row.shareTenths,
            backgroundColor: seriesToken(row.colorIndex),
          }}
        />
      ))}
    </div>
  );
}
