import { useCallback, useEffect, useState } from "react";

/** Where an asynchronous load has got to. */
export type Loadable<T> = Loading | Loaded<T> | LoadFailed;

export interface Loading {
  readonly status: "loading";
}

export interface Loaded<T> {
  readonly status: "loaded";
  readonly value: T;
}

export interface LoadFailed {
  readonly status: "failed";
  readonly error: unknown;
}

export interface LoadState<T> {
  readonly loadable: Loadable<T>;
  /** Runs `load` again; the old value stays on screen until the new one arrives. */
  readonly reload: () => void;
}

/**
 * Runs `load` when the component mounts and again whenever `load` changes,
 * so wrap it in `useCallback`. A result that arrives after the component
 * unmounts, or after a newer load started, is dropped.
 */
export function useLoad<T>(load: () => Promise<T>): LoadState<T> {
  const [loadable, setLoadable] = useState<Loadable<T>>({ status: "loading" });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (value) => {
        if (current) setLoadable({ status: "loaded", value });
      },
      (error: unknown) => {
        if (current) setLoadable({ status: "failed", error });
      },
    );
    return () => {
      current = false;
    };
  }, [load, revision]);

  const reload = useCallback(() => {
    setRevision((previous) => previous + 1);
  }, []);
  return { loadable, reload };
}
