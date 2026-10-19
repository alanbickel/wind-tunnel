/**
 * Line colors in a fixed order, each series taking the next. The order keeps
 * neighbors distinct for color-blind readers; checked with the dataviz
 * palette validator against a white page. Three of them (aqua, yellow, pink)
 * are below 3:1 contrast on white, so every chart comes with a table.
 */
export const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // pink
  "#008300", // green
  "#6250d6", // violet
  "#e34948", // red
] as const;

/**
 * The color for the series at `index`. Past eight series the colors repeat,
 * which makes lines ambiguous; a chart needing more should be split.
 */
export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? SERIES_COLORS[0];
}
