import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// A test file that mocks a module (`vi.mock`, `vi.doMock`) needs a module
// registry of its own, so it's named `*.isolated.test.ts(x)` and runs
// isolated. The rest share their workers' modules, which saves each file the
// worker's startup (see docs/contributing/testing.md).
const ISOLATED_TESTS = "src/**/*.isolated.test.{ts,tsx}";

export default defineConfig({
  plugins: [react()],
  test: {
    // Vitest starts one worker per thread minus one, which oversubscribes a laptop
    // and slows tests 6-10x (see docs/contributing/testing.md). CI keeps the default.
    maxWorkers: process.env.CI ? undefined : "50%",
    // Vitest replaces CSS with an empty string unless told otherwise; the
    // contrast test reads the tokens with ?raw, and the inspector's test its
    // stylesheet.
    css: {
      include: [
        /\/src\/ui\/theme\/tokens\.css/,
        /\/src\/ui\/project\/Inspector\.module\.css\?raw$/,
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "isolated",
          include: [ISOLATED_TESTS],
          setupFiles: ["tests/setup/testing-library.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "shared",
          include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
          exclude: [ISOLATED_TESTS],
          isolate: false,
          // A file that shares a worker must leave nothing behind: its spies
          // and stubbed globals are undone after each test, and the lazy
          // chunks are loaded before it starts, so none arrives after it ends.
          restoreMocks: true,
          unstubGlobals: true,
          setupFiles: [
            "tests/setup/testing-library.ts",
            "src/ui/shared/testing/preload-lazy-chunks.ts",
          ],
        },
      },
    ],
  },
});
