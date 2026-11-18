// Finds test files that mock a module but would run in Vitest's shared
// project, where files share a worker's modules (see vite.config.ts).
import type { SourceFile } from "./stylesheets";

// `vi.mock(` and `vi.doMock(`, which replace a module in the registry.
const MODULE_MOCK = /\bvi\.(?:mock|doMock)\(/;
const ISOLATED_TEST = /\.isolated\.test\.tsx?$/;

/**
 * The paths of the files that mock a module and aren't named
 * `*.isolated.test.ts(x)`. In a shared worker, the module may already be
 * loaded by an earlier file, so the mock would miss it some runs and not
 * others.
 */
export function moduleMocksOutsideIsolatedTests(
  files: readonly SourceFile[],
): string[] {
  return files
    .filter(
      ({ path, text }) => MODULE_MOCK.test(text) && !ISOLATED_TEST.test(path),
    )
    .map(({ path }) => path);
}
