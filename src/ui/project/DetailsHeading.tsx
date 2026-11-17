import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { Selection } from "../../application/details/selection";
import styles from "./SelectionDetails.module.css";
import type { ProjectSelection } from "./useSelection";

export interface DetailsHeadingProps {
  readonly selection: Selection;
  /** Whether the heading should take the focus: just after a selection. */
  readonly takeFocus: ProjectSelection["takeFocus"];
  /** What's selected, then what kind of thing it is. */
  readonly children: ReactNode;
}

/**
 * The inspector's heading for the selected thing. It takes the focus when
 * `takeFocus` says a selection was just made, so the keyboard and a screen
 * reader land on it.
 */
export function DetailsHeading({
  selection,
  takeFocus,
  children,
}: DetailsHeadingProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A layout effect, so the focus moves in the commit that shows Details.
  useLayoutEffect(() => {
    if (takeFocus("heading")) headingRef.current?.focus();
  }, [selection, takeFocus]);
  return (
    <h4 ref={headingRef} tabIndex={-1} className={styles.heading}>
      {children}
    </h4>
  );
}
