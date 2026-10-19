import { useId, type ReactNode } from "react";
import styles from "./Panel.module.css";

export interface PanelProps {
  /** The panel's heading, which also names its region for screen readers. */
  readonly heading: string;
  readonly children: ReactNode;
}

/** A titled section of a screen, on a surface of its own. */
export function Panel({ heading, children }: PanelProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={styles.panel}>
      <h3 id={headingId}>{heading}</h3>
      {children}
    </section>
  );
}
