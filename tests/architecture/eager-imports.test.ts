// Checks that React Flow and Recharts stay out of the app's first chunk
// (#16): only modules loaded with `React.lazy` may import them, so the
// project list loads without either.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findEagerPackageImports } from "./eager-imports";

const MAIN = fileURLToPath(new URL("../../src/main.tsx", import.meta.url));
const FIXTURE_ENTRY = fileURLToPath(
  new URL("fixtures/eager-imports/entry.ts", import.meta.url),
);

/** Each one is loaded lazily, by the component that wraps it (ADR-0010, ADR-0011). */
const LAZY_PACKAGES = ["@xyflow/react", "recharts"];

describe("eager imports", () => {
  it("leave React Flow and Recharts out of the first chunk", () => {
    expect(
      findEagerPackageImports({ entry: MAIN, packages: LAZY_PACKAGES }),
    ).toEqual([]);
  });

  // The check can fail: the fixture reaches the package eagerly twice, by an
  // import and by a re-export, and twice in ways it must not report.
  it("reports static imports and re-exports, not import() or import type", () => {
    expect(
      findEagerPackageImports({
        entry: FIXTURE_ENTRY,
        packages: ["typescript"],
      }),
    ).toEqual([
      { file: "eager.ts", packageName: "typescript" },
      { file: "reexported.ts", packageName: "typescript" },
    ]);
  });
});
