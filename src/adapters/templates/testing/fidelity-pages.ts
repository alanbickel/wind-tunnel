import fidelityIndex from "../../../../docs/design/fidelity.md?raw";

// The fidelity catalog is an index page, a folder per component type with
// its profile and its entries, and the engine and edges' page (#284, #295).
// The tests that check citations against it read every page through here.

/** A set of fidelity pages' text, keyed by each one's path from the repository. */
export type FidelityPages = Readonly<Record<string, string>>;

/** The index page's text, which lists every other page. */
export const FIDELITY_INDEX: string = fidelityIndex;

/** The engine and edges' page: their entries, and the edges' defaults table. */
export const ENGINE_PAGE_PATH = "/docs/design/fidelity/engine-and-edges.md";

/** Every page under `docs/design/fidelity/`, at any depth. */
export const CATALOG_PAGES: FidelityPages = import.meta.glob(
  "/docs/design/fidelity/**/*.md",
  { query: "?raw", import: "default", eager: true },
);

/** The pages of fidelity entries: each type's `<type>-fidelity.md`, and the engine's page. */
export const ENTRY_PAGES: FidelityPages = Object.fromEntries(
  Object.entries(CATALOG_PAGES).filter(
    ([path]) => path.endsWith("-fidelity.md") || path === ENGINE_PAGE_PATH,
  ),
);

/** Each type's profile, `<type>/<type>-profile.md`. */
export const PROFILE_PAGES: FidelityPages = Object.fromEntries(
  Object.entries(CATALOG_PAGES).filter(([path]) =>
    path.endsWith("-profile.md"),
  ),
);

/** The pages with a defaults table: each type's profile, and the engine's page for the edges. */
export const DEFAULTS_PAGES: FidelityPages = {
  ...PROFILE_PAGES,
  [ENGINE_PAGE_PATH]: CATALOG_PAGES[ENGINE_PAGE_PATH] ?? "",
};

/** The path of a component type's profile, e.g. `/docs/design/fidelity/rds/rds-profile.md`. */
export function profilePathOf(type: string): string {
  return `/docs/design/fidelity/${type}/${type}-profile.md`;
}

/** The path of a component type's fidelity entries, beside its profile. */
export function entriesPathOf(type: string): string {
  return `/docs/design/fidelity/${type}/${type}-fidelity.md`;
}

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

/** The IDs of every entry page's entries. */
export const FIDELITY_IDS: ReadonlySet<string> = new Set(
  Object.values(ENTRY_PAGES).flatMap(entryIdsOf),
);

/**
 * A page's defaults table rows, each split into its cells: the rows under
 * its `Default values and their evidence` heading, at any level, up to the
 * next heading. In a profile, the table sits under Settings, before the
 * profile's next section.
 */
export function defaultsRowsOf(page: string): string[][] {
  const [, section] = page.split(/^#+ Default values and their evidence$/m);
  const table = (section ?? "").split(/\n#+ /)[0] ?? "";
  return table
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Component"))
    .map((line) => line.split(" | "));
}

/** The anchor GitHub gives a Markdown heading's text. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replaceAll(" ", "-");
}
