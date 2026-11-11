import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { handleStatus } from "./status-handlers";
import type { Loadable } from "./useLoad";

export interface LoadableViewProps<T> {
  readonly loadable: Loadable<T>;
  /** What's loading, for the messages: "your projects", "the templates". */
  readonly what: string;
  /** Renders the loaded value. */
  readonly children: (value: T) => ReactNode;
}

/** How long the empty region is there before the loading text goes in. */
const REGION_SETTLE_DELAY_MS = 100;

/** False when a view is added, and true a moment after. */
function useRegionSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSettled(true);
    }, REGION_SETTLE_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return settled;
}

/**
 * Shows a load in progress, its failure, or what it loaded. The status
 * region is always there and only its text changes: screen readers skip
 * a region that is added with its text already in it. A load that starts
 * with the view gets its text a moment after the region is added. A reload
 * on a view that has been there longer shows its text at once: the region is
 * already known to screen readers.
 */
export function LoadableView<T>({
  loadable,
  what,
  children,
}: LoadableViewProps<T>) {
  const settled = useRegionSettled();
  const loading = settled && loadable.status === "loading";
  return (
    <>
      <p role="status">{loading ? `Loading ${what}…` : ""}</p>
      {handleStatus<Loadable<T>, ReactNode>(
        {
          loading: () => null,
          failed: ({ error }) => (
            <p role="alert">
              Couldn&apos;t load {what}: {String(error)}
            </p>
          ),
          loaded: ({ value }) => children(value),
        },
        loadable,
      )}
    </>
  );
}
