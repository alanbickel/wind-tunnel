import styles from "./StartupFailure.module.css";

export interface StartupFailureProps {
  readonly error: unknown;
}

/** Shown instead of the app when it can't start, e.g. IndexedDB won't open. */
export function StartupFailure({ error }: StartupFailureProps) {
  return (
    <main className={styles.page}>
      <h1>Wind Tunnel</h1>
      <p role="alert">
        Wind Tunnel couldn't start. This browser may block the storage it needs
        to keep your projects (IndexedDB), as some private windows do.
      </p>
      <pre className={styles.error}>{String(error)}</pre>
    </main>
  );
}
