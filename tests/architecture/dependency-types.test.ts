// Checks ADR-0009's interface rule: every property of a `*Dependencies` type
// in src/ is typed as an interface, never a class, so a test can pass a fake.
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  findClassTypedDependencies,
  programFromConfig,
} from "./dependency-types";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = fileURLToPath(
  new URL("fixtures/dependencies.ts", import.meta.url),
);

const isSourceFile = (fileName: string) =>
  fileName.includes("/src/") && !/\.test\.tsx?$/.test(fileName);

describe("constructor dependencies", () => {
  it("are typed as interfaces, not classes, everywhere in src/", () => {
    const program = programFromConfig(`${ROOT}tsconfig.app.json`);
    const found = findClassTypedDependencies({
      program,
      includes: isSourceFile,
    });
    expect(found).toEqual([]);
  }, 60_000);

  // The check can fail: run it on a fixture with known violations.
  it("are reported when typed as a class", () => {
    const program = ts.createProgram({
      rootNames: [FIXTURE],
      options: { strict: true, noEmit: true },
    });
    const found = findClassTypedDependencies({
      program,
      includes: (fileName) => fileName.endsWith("fixtures/dependencies.ts"),
    });
    expect(found.map((f) => f.location.split(": ")[1])).toEqual([
      "BadDependencies.stopwatch",
      "BadDependencies.spare",
      "AliasDependencies.stopwatch",
    ]);
    expect(found.every((f) => f.classNames.join() === "Stopwatch")).toBe(true);
  });
});
