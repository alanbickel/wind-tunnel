/** One color token's value in each theme, as #rrggbb. */
export interface ThemedColor {
  readonly light: string;
  readonly dark: string;
}

/** The themes a color token holds a value for. */
export type ThemeName = keyof ThemedColor;

/** A color token's name (with its leading `--`) and its declared value. */
export interface ColorDeclaration {
  readonly name: string;
  readonly value: string;
}

const COLOR_DECLARATION = /(--color-[\w-]+)\s*:\s*([^;]+);/g;
const LIGHT_DARK_HEX =
  /^light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)$/i;

/** Every `--color-*` declaration in a stylesheet, in order. */
export function colorDeclarations(css: string): ColorDeclaration[] {
  return [...css.matchAll(COLOR_DECLARATION)].map(([, name, value]) => ({
    name: name ?? "",
    value: (value ?? "").trim(),
  }));
}

/**
 * A declared value as its two themes' colors, or undefined unless it is
 * `light-dark()` of two opaque #rrggbb colors.
 */
export function themedColor(value: string): ThemedColor | undefined {
  const match = LIGHT_DARK_HEX.exec(value);
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { light: match[1], dark: match[2] };
}

/** The WCAG 2.2 contrast ratio of two #rrggbb colors, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** WCAG relative luminance: 0 for black, 1 for white. */
function relativeLuminance(hex: string): number {
  const channel = (start: number) =>
    linearChannel(parseInt(hex.slice(start, start + 2), 16) / 255);
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** An sRGB channel (0 to 1) as linear light. */
function linearChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
