// Finds styling that bypasses the design tokens (ADR-0012): color and
// length literals outside tokens.css, stylesheets outside src/ui/, and
// rules that remove the focus ring.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A file's path, relative to the search root with forward slashes, and its text. */
export interface SourceFile {
  readonly path: string;
  readonly text: string;
}

/** Something a file holds that it shouldn't, and the line it's on (from 1). */
export interface StyleFinding {
  readonly path: string;
  readonly line: number;
  readonly found: string;
}

// Hex colors and CSS color functions. Named colors (`white`) aren't caught;
// reviewers check for those.
const COLOR_LITERAL =
  /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
// A number with an absolute or font-relative unit. Unitless numbers (0,
// line heights, weights) and percentages are fine.
const LENGTH_LITERAL =
  /(?<![\w.#-])(?:\d+(?:\.\d+)?|\.\d+)(?:px|rem|em|ch|ex|vh|vw|vmin|vmax|pt|pc|cm|mm|in)\b/gi;
const FOCUS_RING_REMOVAL = /\boutline(?:-style|-width)?\s*:\s*(?:none|0)\b/gi;
const STYLESHEET = /\.(?:css|scss|sass|less)$/;
const SOURCE = /\.(?:tsx?|css)$/;

/** Every `.ts`, `.tsx`, and stylesheet under `root`, recursively. */
export function sourceFilesUnder(root: string): SourceFile[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => SOURCE.test(path) || isStylesheet(path))
    .map((path) => ({ path, text: readFileSync(join(root, path), "utf8") }));
}

export function isStylesheet(path: string): boolean {
  return STYLESHEET.test(path);
}

/** Hex colors and color functions such as `rgba(`, in any file. */
export function colorLiterals(file: SourceFile): StyleFinding[] {
  return matchesIn(file, COLOR_LITERAL);
}

/** Lengths such as `12px` or `1.5rem`, in a stylesheet. */
export function lengthLiterals(file: SourceFile): StyleFinding[] {
  return matchesIn(file, LENGTH_LITERAL);
}

/** `outline: none` and the like, which hide the focus ring. */
export function focusRingRemovals(file: SourceFile): StyleFinding[] {
  return matchesIn(file, FOCUS_RING_REMOVAL);
}

function matchesIn(file: SourceFile, pattern: RegExp): StyleFinding[] {
  return file.text.split("\n").flatMap((text, index) =>
    [...text.matchAll(pattern)].map(([found]) => ({
      path: file.path,
      line: index + 1,
      found,
    })),
  );
}

/** `ui/run/RunPanel.tsx:12 #fff`, for a readable test failure. */
export function describeFinding({ path, line, found }: StyleFinding): string {
  return `${path}:${String(line)} ${found}`;
}
