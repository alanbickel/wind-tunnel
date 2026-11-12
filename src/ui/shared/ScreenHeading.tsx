import type { ReactNode } from "react";
import styles from "./ScreenHeading.module.css";
import { useFocusOnMount } from "./useFocusOnMount";

export interface ScreenHeadingProps {
  /** For a section the heading names. */
  readonly id?: string;
  readonly children: ReactNode;
  /**
   * Hidden from sight and accessibility while an editor replaces it. Hidden
   * rather than unmounted: the heading takes the focus when it mounts, which
   * would pull it off "Rename" as the editor closes. Hidden, it also keeps
   * naming the section it labels.
   */
  readonly hidden?: boolean;
  /**
   * The heading's name, when its content is a control whose own name says
   * more than the heading does.
   */
  readonly label?: string;
}

/**
 * A screen's heading, focused when it appears, so a keyboard user carries on
 * from the new screen and a screen reader announces it.
 */
export function ScreenHeading(props: ScreenHeadingProps) {
  const { id, children, hidden, label } = props;
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return (
    <h2
      id={id}
      ref={ref}
      tabIndex={-1}
      hidden={hidden}
      aria-label={label}
      className={styles.heading}
    >
      {children}
    </h2>
  );
}
