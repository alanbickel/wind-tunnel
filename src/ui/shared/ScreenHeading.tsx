import type { ReactNode } from "react";
import styles from "./ScreenHeading.module.css";
import { useFocusOnMount } from "./useFocusOnMount";

export interface ScreenHeadingProps {
  /** For a section the heading names. */
  readonly id?: string;
  readonly children: ReactNode;
}

/**
 * A screen's heading, focused when it appears, so a keyboard user carries on
 * from the new screen and a screen reader announces it.
 */
export function ScreenHeading({ id, children }: ScreenHeadingProps) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return (
    <h2 id={id} ref={ref} tabIndex={-1} className={styles.heading}>
      {children}
    </h2>
  );
}
