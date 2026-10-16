// Checks CONTRIBUTING rule 11: each class in src/ lives in a file named after
// it. ESLint's `max-classes-per-file` checks the "one class per file" half.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findMisnamedClassFiles, kebabCase } from "./class-files";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const FIXTURES = fileURLToPath(new URL("fixtures/", import.meta.url));

const isSourceFile = (fileName: string) => !/\.test\.tsx?$/.test(fileName);

const misnamedInSrc = () =>
  findMisnamedClassFiles({ root: SRC, includes: isSourceFile }).map(
    ({ file, className }) => `${file}: ${className}`,
  );

describe("class files", () => {
  it("are named after their class in kebab case, everywhere in src/", () => {
    expect(misnamedInSrc()).toEqual([]);
  });

  // The check can fail: the fixture's class doesn't match its file name.
  it("reports a class in a file named for something else", () => {
    expect(
      findMisnamedClassFiles({ root: FIXTURES, includes: () => true }),
    ).toEqual([
      {
        file: "dependencies.ts",
        className: "Stopwatch",
        expectedName: "stopwatch",
      },
    ]);
  });

  it.each([
    ["ComponentRegistryMap", "component-registry-map"],
    ["IndexedDbProjectRepository", "indexed-db-project-repository"],
    ["HTTPServer", "http-server"],
    ["Base64Encoder", "base64-encoder"],
  ])("names the file for %s %s", (className, fileName) => {
    expect(kebabCase(className)).toBe(fileName);
  });
});
