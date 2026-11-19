import fidelityIndex from "../../../../docs/design/fidelity.md?raw";

// The fidelity catalog is an index page and a page per service (#284). The
// tests that check citations against it read every page through here.

/** The index page's text, which lists the service pages. */
export const FIDELITY_INDEX: string = fidelityIndex;

/** Each service page's text, keyed by its path from the repository. */
export const FIDELITY_PAGES: Readonly<Record<string, string>> =
  import.meta.glob("/docs/design/fidelity/*.md", {
    query: "?raw",
    import: "default",
    eager: true,
  });

/**
 * A fidelity ID's pattern, e.g. `RDS-2` or `S3-1`: a prefix of capitals,
 * with digits allowed after the first, then a number. The tests that find
 * IDs build their RegExps from it, so a new prefix works in all of them.
 */
export const FIDELITY_ID_PATTERN = String.raw`[A-Z][A-Z0-9]*-\d+`;

/** The IDs of a page's entries, from headings like `#### RDS-2: …`. */
export function entryIdsOf(page: string): string[] {
  const heading = new RegExp(`^#### (${FIDELITY_ID_PATTERN}):`, "gm");
  return [...page.matchAll(heading)].map((m) => m[1] ?? "");
}

/** The IDs of every service page's entries. */
export const FIDELITY_IDS: ReadonlySet<string> = new Set(
  Object.values(FIDELITY_PAGES).flatMap(entryIdsOf),
);

/** The anchor GitHub gives a Markdown heading's text. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replaceAll(" ", "-");
}
