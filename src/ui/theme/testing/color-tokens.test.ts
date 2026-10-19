import { describe, expect, it } from "vitest";
import { colorDeclarations, contrastRatio, themedColor } from "./color-tokens";

describe("contrastRatio", () => {
  // Fails if a channel's weight or either branch of the sRGB linearization
  // is wrong: pure red and pure blue test their weights alone (the grays
  // only test the weights' sum), and #0a0a0a's channels fall in the linear
  // branch. Expected values worked from WCAG's formula.
  it.each([
    ["#000000", "#ffffff", 21],
    ["#ffffff", "#ffffff", 1],
    ["#767676", "#ffffff", 4.54],
    ["#ff0000", "#ffffff", 4.0],
    ["#0000ff", "#ffffff", 8.59],
    ["#0a0a0a", "#ffffff", 19.8],
  ])("%s on %s is %d:1", (first, second, expected) => {
    expect(contrastRatio(first, second)).toBeCloseTo(expected, 2);
  });

  // Fails if the ratio depends on which color is passed first.
  it("is the same either way round", () => {
    expect(contrastRatio("#ffffff", "#1b1f24")).toBe(
      contrastRatio("#1b1f24", "#ffffff"),
    );
  });
});

describe("themedColor", () => {
  // Fails if the light and dark values are swapped: light-dark() lists
  // light first.
  it("reads light-dark() of two #rrggbb colors, light first", () => {
    expect(themedColor("light-dark(#ffffff, #111318)")).toEqual({
      light: "#ffffff",
      dark: "#111318",
    });
  });

  // Fails if a value whose contrast can't be computed is accepted.
  it.each([
    "#ffffff",
    "light-dark(white, black)",
    "light-dark(#fff, #000)",
    "light-dark(rgb(0 0 0 / 50%), #000000)",
  ])("rejects %s", (value) => {
    expect(themedColor(value)).toBeUndefined();
  });
});

describe("colorDeclarations", () => {
  // Fails if spacing or other non-color tokens are picked up, or a color
  // declared over two lines is missed.
  it("finds every --color-* declaration and nothing else", () => {
    const css = `:root {
      --color-text: light-dark(#000000, #ffffff);
      --space-1: 0.25rem;
      --color-bg:
        light-dark(#ffffff, #000000);
    }`;
    expect(colorDeclarations(css)).toEqual([
      { name: "--color-text", value: "light-dark(#000000, #ffffff)" },
      { name: "--color-bg", value: "light-dark(#ffffff, #000000)" },
    ]);
  });
});
