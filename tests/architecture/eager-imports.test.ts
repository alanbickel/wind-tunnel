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
const UNRESOLVED_ENTRY = fileURLToPath(
  new URL("fixtures/eager-imports/unresolved.ts", import.meta.url),
);

/** Each one is loaded lazily, by the component that wraps it (ADR-0010, ADR-0011). */
const LAZY_PACKAGES = ["@xyflow/react", "recharts"];

describe("eager imports", () => {
  // Fails if Diagram imports DiagramCanvas statically: the walk reaches
  // DiagramCanvas.tsx and to-react-flow.tsx, and the list isn't empty.
  it("leave React Flow and Recharts out of the first chunk", () => {
    expect(
      findEagerPackageImports({ entry: MAIN, packages: LAZY_PACKAGES }),
    ).toEqual([]);
  });

  // Fails if isRuntimeImportOrExport follows `import type` (types-only.ts
  // joins the list) or skips `export … from` (reexported.ts drops out), or
  // if resolveSource stops looking for a folder's index (it throws on
  // `./barrel`).
  it("reports static imports, folder imports, and re-exports, not import() or import type", () => {
    expect(
      findEagerPackageImports({
        entry: FIXTURE_ENTRY,
        packages: ["typescript"],
      }),
    ).toEqual([
      { file: "barrel/index.ts", packageName: "typescript" },
      { file: "eager.ts", packageName: "typescript" },
      { file: "reexported.ts", packageName: "typescript" },
    ]);
  });

  // Fails if resolveSource skips a specifier that names no file, as it once
  // skipped folder imports: the walk ends quietly and reports nothing.
  it("throws on an import that names no file, rather than skip it", () => {
    expect(() =>
      findEagerPackageImports({
        entry: UNRESOLVED_ENTRY,
        packages: ["typescript"],
      }),
    ).toThrow('no source file for "./missing"');
  });
});
