/** "1 problem", "2 problems"; undefined for none. */
export function problemCount(count: number): string | undefined {
  if (count === 0) return undefined;
  return `${String(count)} ${count === 1 ? "problem" : "problems"}`;
}
