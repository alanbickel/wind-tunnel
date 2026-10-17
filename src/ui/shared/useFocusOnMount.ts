import { useLayoutEffect, useRef, type RefObject } from "react";

/**
 * A ref whose element gets keyboard focus when the component mounts. Use it
 * to move focus to a new screen, since the control that opened the screen
 * unmounts and focus would otherwise fall back to `<body>`.
 */
export function useFocusOnMount<T extends HTMLElement>(): RefObject<T | null> {
  const ref = useRef<T>(null);
  // A layout effect, so focus moves in the same commit that shows the element.
  useLayoutEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
