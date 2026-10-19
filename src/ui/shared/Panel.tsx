import { useId, type ReactNode } from "react";
import styles from "./Panel.module.css";

export interface PanelProps {
  /** The panel's heading, which also names its region for screen readers. */
  readonly heading: string;
  /**
   * Scroll the content inside the panel when its container caps the
   * panel's height, as a wide project screen does. The panel then takes a
   * tab stop, so the keyboard can scroll it.
   */
  readonly scrolls?: boolean;
  readonly children: ReactNode;
}

/**
 * A titled section of a screen, on a surface of its own. Its content
 * stacks, and a child with `flex: 1` takes the height left over.
 */
export function Panel({ heading, scrolls = false, children }: PanelProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={scrolls ? styles.scrolling : styles.panel}
      tabIndex={scrolls ? 0 : undefined}
    >
      <h3 id={headingId}>{heading}</h3>
      {children}
    </section>
  );
}
