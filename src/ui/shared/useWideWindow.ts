import { useSyncExternalStore } from "react";

/**
 * The `--breakpoint-wide` token's width, written out: `matchMedia`, like
 * `@media`, can't read a custom property. `useWideWindow.test.ts` fails if
 * the two differ.
 */
export const WIDE_WINDOW_QUERY = "(min-width: 64rem)";

/**
 * Whether the window is at least `--breakpoint-wide` across, the width from
 * which the project screen fills the window in two columns. Updates when the
 * window crosses it. For what CSS can't do alone, such as roles that only
 * one layout has; style by width with a media query instead.
 */
export function useWideWindow(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_WINDOW_QUERY);
  query.addEventListener("change", onChange);
  return () => {
    query.removeEventListener("change", onChange);
  };
}

function isWide(): boolean {
  return window.matchMedia(WIDE_WINDOW_QUERY).matches;
}
