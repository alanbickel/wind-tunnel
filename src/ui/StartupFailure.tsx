export interface StartupFailureProps {
  readonly error: unknown;
}

/** Shown instead of the app when it can't start, e.g. IndexedDB won't open. */
export function StartupFailure({ error }: StartupFailureProps) {
  return (
    <main>
      <h1>Wind Tunnel</h1>
      <p role="alert">
        Wind Tunnel couldn't start. This browser may block the storage it needs
        to keep your projects (IndexedDB), as some private windows do.
      </p>
      <pre>{String(error)}</pre>
    </main>
  );
}
