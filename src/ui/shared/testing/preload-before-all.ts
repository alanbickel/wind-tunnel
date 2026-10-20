import { beforeAll } from "vitest";

/** Long enough for a large library's first import while the rest of the suite runs. */
const PRELOAD_TIMEOUT_MS = 30_000;

/**
 * Imports a module that a component loads with `React.lazy` before the
 * file's tests run. A full run can take seconds over the first import of
 * React Flow or Recharts, so without this a test that waits for the lazy
 * part times out. The component still shows its stand-in on first render.
 */
export function preloadBeforeAll(load: () => Promise<unknown>): void {
  beforeAll(async () => {
    await load();
  }, PRELOAD_TIMEOUT_MS);
}
