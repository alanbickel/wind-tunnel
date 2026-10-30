/** Items as a list in a sentence: "A", "A and B", "A, B, and C". */
export function listOf(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${String(items.at(-1))}`;
}
