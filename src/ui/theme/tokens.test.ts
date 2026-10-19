import { describe, expect, it } from "vitest";
import {
  colorDeclarations,
  contrastRatio,
  themedColor,
  type ThemedColor,
  type ThemeName,
} from "./testing/color-tokens";
import tokensCss from "./tokens.css?raw";

// WCAG 2.2 AA: 1.4.3 for text, 1.4.11 for controls, focus rings, and graphics.
const TEXT_RATIO = 4.5;
const NON_TEXT_RATIO = 3;

/** Foregrounds that must each reach `minRatio` on each of the backgrounds. */
interface ContrastRule {
  readonly foregrounds: readonly string[];
  readonly backgrounds: readonly string[];
  readonly minRatio: number;
}

const BACKGROUNDS = ["--color-bg", "--color-surface", "--color-surface-raised"];
// Charts sit on a panel; the diagram's canvas is the page.
const CHART_AND_DIAGRAM_BACKGROUNDS = ["--color-bg", "--color-surface"];
const SERIES = [1, 2, 3, 4, 5, 6, 7, 8].map(
  (n) => `--color-series-${String(n)}`,
);

/**
 * Every pair of colors the UI may put together. A stylesheet that combines
 * two tokens in a new way adds the pair here.
 */
const CONTRAST_RULES: readonly ContrastRule[] = [
  {
    foregrounds: [
      "--color-text",
      "--color-text-muted",
      "--color-accent",
      "--color-accent-hover",
      "--color-status-ok",
      "--color-status-warn",
      "--color-status-error",
    ],
    backgrounds: BACKGROUNDS,
    minRatio: TEXT_RATIO,
  },
  {
    foregrounds: ["--color-on-accent"],
    backgrounds: ["--color-accent", "--color-accent-hover"],
    minRatio: TEXT_RATIO,
  },
  {
    foregrounds: ["--color-border", "--color-focus-ring"],
    backgrounds: BACKGROUNDS,
    minRatio: NON_TEXT_RATIO,
  },
  {
    foregrounds: ["--color-diagram-edge", ...SERIES],
    backgrounds: CHART_AND_DIAGRAM_BACKGROUNDS,
    minRatio: NON_TEXT_RATIO,
  },
];

/**
 * Tokens that carry no information, so WCAG sets them no ratio. Each says
 * why; anything that tells the user something belongs in a rule above.
 */
const DECORATIVE: Readonly<Record<string, string>> = {
  "--color-divider":
    "separates regions that already differ in content or background; chart gridlines are recessive, and each chart has a table",
};

const THEMES: readonly ThemeName[] = ["light", "dark"];

interface ContrastCase {
  readonly foreground: string;
  readonly background: string;
  readonly theme: ThemeName;
  readonly minRatio: number;
}

const CASES: readonly ContrastCase[] = CONTRAST_RULES.flatMap((rule) =>
  rule.foregrounds.flatMap((foreground) =>
    rule.backgrounds.flatMap((background) =>
      THEMES.map((theme) => ({
        foreground,
        background,
        theme,
        minRatio: rule.minRatio,
      })),
    ),
  ),
);

const TOKENS = new Map(
  colorDeclarations(tokensCss).map(({ name, value }) => [
    name,
    themedColor(value),
  ]),
);

function colorOf(name: string): ThemedColor {
  const color = TOKENS.get(name);
  if (color === undefined) throw new Error(`${name} isn't in tokens.css`);
  return color;
}

describe("color tokens", () => {
  // Fails if a color token is declared as one value, a named color, or a
  // translucent rgba(), none of which the contrast check below can read.
  it("hold an opaque #rrggbb for each theme, with light-dark()", () => {
    const unreadable = colorDeclarations(tokensCss)
      .filter(({ value }) => themedColor(value) === undefined)
      .map(({ name, value }) => `${name}: ${value}`);
    expect(TOKENS.size).toBeGreaterThan(0);
    expect(unreadable).toEqual([]);
  });

  // Fails if any token in a pair is changed to a low-contrast value, e.g.
  // --color-text-muted's dark value to #5a606b (2.9:1 on --color-bg).
  it.each(CASES)(
    "$foreground on $background ($theme): at least $minRatio:1",
    ({ foreground, background, theme, minRatio }) => {
      const ratio = contrastRatio(
        colorOf(foreground)[theme],
        colorOf(background)[theme],
      );
      expect(ratio).toBeGreaterThanOrEqual(minRatio);
    },
  );

  // Fails if a new --color-* token is added to tokens.css without a rule
  // above or a reason in DECORATIVE, so no token skips the check.
  it("are each in a contrast rule or listed as decorative", () => {
    const checked = new Set([
      ...CASES.flatMap((pair) => [pair.foreground, pair.background]),
      ...Object.keys(DECORATIVE),
    ]);
    const unchecked = [...TOKENS.keys()].filter((name) => !checked.has(name));
    expect(unchecked).toEqual([]);
  });
});
