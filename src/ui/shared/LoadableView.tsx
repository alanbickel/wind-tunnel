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

/** Shows a load in progress, its failure, or what it loaded. */
export function LoadableView<T>({
  loadable,
  what,
  children,
}: LoadableViewProps<T>) {
  return handleStatus<Loadable<T>, ReactNode>(
    {
      loading: () => <p role="status">Loading {what}…</p>,
      failed: ({ error }) => (
        <p role="alert">
          Couldn&apos;t load {what}: {String(error)}
        </p>
      ),
      loaded: ({ value }) => children(value),
    },
    loadable,
  );
}
