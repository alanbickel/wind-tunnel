// Shared by the trace tests in this folder: worked examples for the guides in
// docs/architecture/. Each test runs a building block through a small scenario
// and saves a text timeline next to it. The timelines are snapshots: if
// behavior changes, the test fails and the diff shows exactly what changed.
// Run `npx vitest run -u src/domain/traces` to accept an intended change, then
// check the guide still matches.

/** Renders rows as a left-aligned text table with a header. */
// eslint-disable-next-line max-params -- moved out of a test file, where the rule is off; tests only
export function table(
  title: string,
  header: string[],
  rows: string[][],
): string {
  const widths = header.map((h, col) =>
    Math.max(h.length, ...rows.map((row) => (row[col] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells
      .map((cell, col) => cell.padEnd(widths[col] ?? 0))
      .join("  ")
      .trimEnd();
  return [title, "", line(header), ...rows.map(line), ""].join("\n");
}
