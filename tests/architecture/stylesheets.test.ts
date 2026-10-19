// Checks ADR-0012: every color and length comes from the design tokens, all
// styles live in src/ui/, and nothing hides the focus ring.
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  breakpointValues,
  colorLiterals,
  describeFinding,
  focusRingRemovals,
  isStylesheet,
  lengthLiterals,
  sourceFilesUnder,
  type SourceFile,
} from "./stylesheets";

const SRC = fileURLToPath(new URL("../../src/", import.meta.url));
const TOKENS = "ui/theme/tokens.css";
const BASE = "ui/theme/base.css";
// The rule cuts both durations on every element (`*`), overriding the
// stylesheets' own (`!important`).
const REDUCED_MOTION_RULE =
  /@media \(prefers-reduced-motion: reduce\) \{\s*\*,[^}]*animation-duration: [^;]+ !important;[^}]*transition-duration: [^;]+ !important;/;

/**
 * Files that may still hold color literals, each with the reason. A file
 * leaves the list when it moves to tokens; the test fails if one no longer
 * needs to be here.
 */
const COLOR_EXCEPTIONS: Readonly<Record<string, string>> = {
  "ui/charts/series-colors.ts":
    "the series hues move to the --color-series-* tokens when the charts are themed",
  "ui/charts/TimeSeriesChart.tsx":
    "the axis color moves to a token when the charts are themed",
};

const isTest = (path: string) => /\.test\.tsx?$/.test(path);

const uiFiles = sourceFilesUnder(SRC).filter(
  ({ path }) => path.startsWith("ui/") && path !== TOKENS && !isTest(path),
);
const uiStylesheets = uiFiles.filter(({ path }) => isStylesheet(path));
const tokens = sourceFilesUnder(SRC).find(({ path }) => path === TOKENS);
const BREAKPOINTS = tokens === undefined ? [] : breakpointValues(tokens);

describe("styles in src/ui/", () => {
  // Fails if a stylesheet or component gains a literal such as
  // `color: #fff`, which wouldn't follow the theme.
  it("hold no color literal outside tokens.css", () => {
    const found = uiFiles
      .filter(({ path }) => !(path in COLOR_EXCEPTIONS))
      .flatMap(colorLiterals)
      .map(describeFinding);
    expect(found).toEqual([]);
  });

  // Fails if an exception outlives its reason, e.g. series-colors.ts once
  // it reads the tokens: delete it from the list.
  it("list only exceptions that still hold a color literal", () => {
    const stale = Object.keys(COLOR_EXCEPTIONS).filter((path) =>
      uiFiles.every(
        (file) => file.path !== path || colorLiterals(file).length === 0,
      ),
    );
    expect(stale).toEqual([]);
  });

  // Fails if a stylesheet sets a size or spacing such as `padding: 12px`
  // rather than a token, or a media query uses a width that isn't a
  // --breakpoint-* token, such as `@media (min-width: 50rem)`.
  it("hold no length literal in a stylesheet outside tokens.css", () => {
    const found = uiStylesheets
      .flatMap((file) => lengthLiterals(file, BREAKPOINTS))
      .map(describeFinding);
    expect(found).toEqual([]);
  });

  // Fails if tokens.css loses its breakpoint tokens, or breakpointValues
  // stops reading them, which would let the check above pass vacuously.
  it("have breakpoint tokens for media queries to use", () => {
    expect(BREAKPOINTS).toContain("64rem");
  });

  // Fails if a stylesheet sets `outline: none` on a control, hiding where
  // the keyboard focus is.
  it("never remove the focus ring", () => {
    const found = uiStylesheets.flatMap(focusRingRemovals).map(describeFinding);
    expect(found).toEqual([]);
  });

  // Fails if base.css loses its prefers-reduced-motion rule, or the rule
  // stops cutting transitions or animations.
  it("turn motion off for users who ask for reduced motion", () => {
    const base = uiStylesheets.find(({ path }) => path === BASE);
    expect(base?.text).toMatch(REDUCED_MOTION_RULE);
  });
});

describe("stylesheets", () => {
  // Fails if a stylesheet is added outside src/ui/, e.g. src/adapters/x.css.
  it("live only in src/ui/", () => {
    const outside = sourceFilesUnder(SRC)
      .map(({ path }) => path)
      .filter((path) => isStylesheet(path) && !path.startsWith("ui/"));
    expect(outside).toEqual([]);
  });
});

// Each check can fail: these samples hold what it looks for, and the
// "finds no" samples guard against false alarms.
describe("the style checks", () => {
  const file = (text: string): SourceFile => ({ path: "sample.css", text });

  // Fails if COLOR_LITERAL stops matching a hex color or a color function.
  it.each([
    ["color: #fff;", "#fff"],
    ["stroke: '#898781'", "#898781"],
    ["background: rgba(255, 255, 255, 0.5);", "rgba("],
    ["color: oklch(70% 0.1 200);", "oklch("],
  ])("finds the color in %s", (text, found) => {
    expect(colorLiterals(file(text)).map((f) => f.found)).toEqual([found]);
  });

  // Fails if COLOR_LITERAL matches a function whose name ends in "color",
  // a token reference, or a URL fragment.
  it.each(["seriesColor(index)", "color: var(--color-text);", 'href="#root"'])(
    "finds no color in %s",
    (text) => {
      expect(colorLiterals(file(text))).toEqual([]);
    },
  );

  // Fails if LENGTH_LITERAL stops matching a unit, or a leading-dot number.
  it.each([
    ["padding: 12px;", "12px"],
    ["margin: 0 1.5rem;", "1.5rem"],
    ["max-width: .5em;", ".5em"],
  ])("finds the length in %s", (text, found) => {
    expect(lengthLiterals(file(text)).map((f) => f.found)).toEqual([found]);
  });

  // Fails if LENGTH_LITERAL matches unitless numbers, percentages, or a
  // class name that happens to end in a unit.
  it.each([
    "margin: 0;",
    "line-height: 1.25;",
    "width: 100%;",
    ".h2px { gap: var(--space-2); }",
  ])("finds no length in %s", (text) => {
    expect(lengthLiterals(file(text))).toEqual([]);
  });

  // Fails if lengthLiterals allows a breakpoint's value anywhere but a
  // media query, or allows any length in a media query.
  it.each([
    ["@media (min-width: 64rem) {", []],
    ["@container (min-width: 64rem) {", []],
    ["@media (min-width: 50rem) {", ["50rem"]],
    ["  max-width: 64rem;", ["64rem"]],
  ])("with a 64rem breakpoint, finds in %s: %j", (text, found) => {
    const findings = lengthLiterals(file(text), ["64rem"]);
    expect(findings.map((f) => f.found)).toEqual(found);
  });

  // Fails if BREAKPOINT_TOKEN reads other tokens, or keeps the whitespace.
  it("reads only the breakpoint tokens' values", () => {
    const text = "--space-1: 0.25rem;\n  --breakpoint-wide:  64rem ;";
    expect(breakpointValues(file(text))).toEqual(["64rem"]);
  });

  // Fails if FOCUS_RING_REMOVAL misses one way of writing it.
  it.each(["outline: none;", "outline: 0;", "outline-style: none;"])(
    "finds the focus ring removed by %s",
    (text) => {
      expect(focusRingRemovals(file(text))).toHaveLength(1);
    },
  );

  // Fails if line numbers count from 0, or count the wrong line.
  it("reports the line a finding is on", () => {
    const findings = colorLiterals(file(".a {\n  color: #000;\n}"));
    expect(findings.map(describeFinding)).toEqual(["sample.css:2 #000"]);
  });
});
