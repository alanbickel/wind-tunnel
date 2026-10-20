/** A chart value as the tooltip and the table show it: rounded, with commas. */
export function formatValue(value: unknown): string {
  return typeof value === "number"
    ? Math.round(value).toLocaleString("en-US")
    : String(value);
}
