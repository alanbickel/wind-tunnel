import type { ReactNode } from "react";
import { useFocusOnMount } from "./useFocusOnMount";

export interface ScreenHeadingProps {
  readonly children: ReactNode;
}

/**
 * A screen's heading, focused when it appears, so a keyboard user carries on
 * from the new screen and a screen reader announces it.
 */
export function ScreenHeading({ children }: ScreenHeadingProps) {
  const ref = useFocusOnMount<HTMLHeadingElement>();
  return (
    <h2 ref={ref} tabIndex={-1}>
      {children}
    </h2>
  );
}
