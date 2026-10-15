// Finds classes whose file isn't named after them (CONTRIBUTING rule 11):
// `ComponentRegistryMap` belongs in `component-registry-map.ts`.
import { readFileSync } from "node:fs";
import { basename, extname, relative } from "node:path";
import ts from "typescript";

/** A class declared in a file named for something else. */
export interface MisnamedClassFile {
  /** Path relative to the search root, with forward slashes. */
  readonly file: string;
  readonly className: string;
  /** The file name the class should have, without the extension. */
  readonly expectedName: string;
}

/** Where to look, and which files count. */
export interface FindMisnamedClassFilesInput {
  /** Directory to search recursively. */
  readonly root: string;
  /** Keeps a file in the search; tests are usually left out. */
  readonly includes: (fileName: string) => boolean;
}

/** `ComponentRegistryMap` → `component-registry-map`; `IndexedDbX` → `indexed-db-x`. */
export function kebabCase(pascalName: string): string {
  return pascalName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** Every class under `root` whose file name isn't its name in kebab case. */
export function findMisnamedClassFiles({
  root,
  includes,
}: FindMisnamedClassFilesInput): MisnamedClassFile[] {
  return ts.sys
    .readDirectory(root, [".ts", ".tsx"])
    .filter(includes)
    .flatMap((fileName) =>
      classNamesIn(fileName).map((className) => ({
        file: relative(root, fileName).replaceAll("\\", "/"),
        className,
        expectedName: kebabCase(className),
      })),
    )
    .filter(({ file, expectedName }) => fileStem(file) !== expectedName);
}

function classNamesIn(fileName: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
  );
  return source.statements
    .filter(ts.isClassDeclaration)
    .map((declaration) => declaration.name?.text ?? "");
}

function fileStem(file: string): string {
  return basename(file, extname(file));
}
