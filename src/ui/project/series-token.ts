/** How many series colours the tokens define. */
const SERIES_COUNT = 8;

/**
 * The CSS value of the series colour at `index` (`--color-series-1` to `-8`),
 * so a swatch follows the theme. A workflow the project no longer has has no
 * index, and gets the muted border colour. Past eight the colours repeat;
 * the text beside every swatch says which workflow it is.
 */
export function seriesToken(index: number | undefined): string {
  if (index === undefined) return "var(--color-border)";
  return `var(--color-series-${String((index % SERIES_COUNT) + 1)})`;
}
