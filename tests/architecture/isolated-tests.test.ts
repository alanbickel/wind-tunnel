// Checks that every test file that mocks a module runs isolated, as
// vite.config.ts's projects expect (docs/contributing/testing.md).
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { moduleMocksOutsideIsolatedTests } from "./isolated-tests";
import { sourceFilesUnder } from "./stylesheets";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));

describe("isolated tests", () => {
  // Fails if a file under src/ calls vi.mock or vi.doMock and isn't named
  // *.isolated.test.ts(x): renaming DiagramCanvas.isolated.test.tsx back to
  // DiagramCanvas.test.tsx lists it.
  it("hold every module mock", () => {
    expect(moduleMocksOutsideIsolatedTests(sourceFilesUnder(SRC))).toEqual([]);
  });

  // Fails if the check misses either kind of mock, or stops letting an
  // isolated file (.ts or .tsx) mock: the list would lose a.test.ts or
  // b.test.tsx, or gain one of the isolated files.
  it("reports vi.mock and vi.doMock outside isolated files only", () => {
    expect(
      moduleMocksOutsideIsolatedTests([
        { path: "a.test.ts", text: 'vi.mock("./x");' },
        { path: "b.test.tsx", text: 'vi.doMock("./x", () => ({}));' },
        { path: "c.test.ts", text: "vi.fn(); vi.spyOn(console, 'error');" },
        { path: "d.isolated.test.ts", text: 'vi.mock("./x");' },
        { path: "e.isolated.test.tsx", text: 'vi.doMock("./x");' },
      ]),
    ).toEqual(["a.test.ts", "b.test.tsx"]);
  });
});
