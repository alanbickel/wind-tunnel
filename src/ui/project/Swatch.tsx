import { seriesToken } from "./series-token";
import styles from "./MixBar.module.css";

export interface SwatchProps {
  readonly colorIndex: number | undefined;
}

/** A workflow's colour beside its name; decoration, as the name is beside it. */
export function Swatch({ colorIndex }: SwatchProps) {
  return (
    <span
      aria-hidden="true"
      className={styles.swatch}
      style={{ backgroundColor: seriesToken(colorIndex) }}
    />
  );
}
