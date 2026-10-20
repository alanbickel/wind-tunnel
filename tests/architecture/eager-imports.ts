// Finds packages the app loads before anything lazy. Vite puts every module
// the entry reaches through static imports into the first chunk, along with
// every package those modules import. A module reached only through
// `import()` (as `React.lazy` does) starts a chunk of its own.
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import ts from "typescript";

/** A package imported by a module the entry loads eagerly. */
export interface EagerPackageImport {
  /** The importing module, relative to the entry's folder, with forward slashes. */
  readonly file: string;
  readonly packageName: string;
}

/** Where loading starts, and which packages to look for. */
export interface FindEagerPackageImportsInput {
  /** The entry module's absolute path, such as `src/main.tsx`. */
  readonly entry: string;
  /** Package names; a subpath (`recharts/types`) counts as its package. */
  readonly packages: readonly string[];
}

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

/** Every static import of one of `packages` from a module `entry` loads eagerly. */
export function findEagerPackageImports({
  entry,
  packages,
}: FindEagerPackageImportsInput): EagerPackageImport[] {
  const root = dirname(entry);
  return eagerModules(entry).flatMap((fileName) =>
    staticSpecifiers(fileName)
      .map((specifier) => packageOf(specifier, packages))
      .filter((packageName) => packageName !== undefined)
      .map((packageName) => ({
        file: relative(root, fileName).replaceAll("\\", "/"),
        packageName,
      })),
  );
}

/** `entry` and every source module it reaches through static imports. */
function eagerModules(entry: string): string[] {
  const seen = new Set<string>([entry]);
  // A Set's iterator visits values added during the loop, so this walks
  // the whole graph, each module once.
  for (const fileName of seen) {
    staticSpecifiers(fileName)
      .map((specifier) => resolveSource(fileName, specifier))
      .filter((resolved) => resolved !== undefined)
      .forEach((resolved) => seen.add(resolved));
  }
  return [...seen];
}

/**
 * The specifiers of a module's `import` and `export … from` declarations,
 * skipping `import type` and `export type`, which compile away. `import()`
 * calls aren't declarations, so they're never included.
 */
function staticSpecifiers(fileName: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    readFileSync(fileName, "utf8"),
    ts.ScriptTarget.Latest,
  );
  return source.statements
    .filter(isRuntimeImportOrExport)
    .map((statement) => statement.moduleSpecifier)
    .filter((specifier) => specifier !== undefined)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text);
}

function isRuntimeImportOrExport(
  statement: ts.Statement,
): statement is ts.ImportDeclaration | ts.ExportDeclaration {
  if (ts.isImportDeclaration(statement)) {
    return statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword;
  }
  return ts.isExportDeclaration(statement) && !statement.isTypeOnly;
}

/** The source file a relative specifier names; undefined for packages and stylesheets. */
function resolveSource(
  fromFile: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = join(dirname(fromFile), specifier.replace(/\?.*$/, ""));
  const candidates = SOURCE_EXTENSIONS.includes(extname(base))
    ? [base]
    : SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`);
  return candidates.find((candidate) => existsSync(candidate));
}

/** Which of `packages` the specifier imports, if any. */
function packageOf(
  specifier: string,
  packages: readonly string[],
): string | undefined {
  return packages.find(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
}
