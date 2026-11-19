import { describe, expect, it } from "vitest";
import {
  anchorOf,
  CATALOG_PAGES,
  defaultsRowsOf,
  ENGINE_PAGE_PATH,
  ENTRY_PAGES,
  entryIdsOf,
  FIDELITY_INDEX,
  PROFILE_PAGES,
} from "./fidelity-pages";

// The fidelity catalog stays one catalog across its pages (#284, #295): an
// ID names one entry, the index reaches every page, each type's folder holds
// its profile and its entries, and the docs' links to an entry land on the
// page it's on.

const INDEX_PATH = "/docs/design/fidelity.md";
const CATALOG_PATH = "/docs/design/fidelity";

/** The Markdown that may link to a fidelity page, keyed by its path. */
const DOCS: Readonly<Record<string, string>> = import.meta.glob(
  ["/docs/**/*.md", "/README.md", "/CONTRIBUTING.md"],
  { query: "?raw", import: "default", eager: true },
);

/** Each fidelity page's text, the index's included, keyed by its path. */
const ALL_PAGES: Readonly<Record<string, string>> = {
  [INDEX_PATH]: FIDELITY_INDEX,
  ...CATALOG_PAGES,
};

const ADDENDUM_HEADING = "\n## Addendum";

/** A link to a fidelity page, as written and as resolved. */
interface FidelityLink {
  readonly from: string;
  readonly path: string;
  readonly anchor: string;
  /** Where the link starts in the doc's text. */
  readonly index: number;
}

/** The links in a doc to a fidelity page, resolved from the doc's path. */
function fidelityLinksIn([from, text]: [string, string]): FidelityLink[] {
  return [...text.matchAll(/\]\(([^)\s#]+\.md)(#[^)\s]*)?\)/g)]
    .map((m) => ({
      url: new URL(`${m[1] ?? ""}${m[2] ?? ""}`, `file://${from}`),
      index: m.index,
    }))
    .filter(({ url }) => url.protocol === "file:")
    .filter(({ url }) => url.pathname.startsWith(CATALOG_PATH))
    .map(({ url, index }) => ({
      from,
      path: url.pathname,
      anchor: decodeURIComponent(url.hash.slice(1)),
      index,
    }));
}

/**
 * Whether a link is one an accepted ADR keeps as written, because a later
 * addendum links the entry where it is now (documentation.md, "ADRs"). A
 * link in the last addendum that links its anchor is checked like any other.
 */
function keptByAddendum({ from, anchor, index }: FidelityLink): boolean {
  if (!from.startsWith("/docs/adr/")) return false;
  const text = DOCS[from] ?? "";
  const nextAddendum = text.indexOf(ADDENDUM_HEADING, index);
  return (
    nextAddendum !== -1 && text.slice(nextAddendum).includes(`#${anchor})`)
  );
}

/** The anchors of a page's headings, as GitHub makes them. */
function anchorsOf(page: string): Set<string> {
  return new Set(
    [...page.matchAll(/^#+ (.+)$/gm)].map((m) => anchorOf(m[1] ?? "")),
  );
}

/** The file names in each type's folder, keyed by the folder's name. */
function filesByFolder(): Map<string, string[]> {
  const folders = new Map<string, string[]>();
  for (const path of Object.keys(CATALOG_PAGES)) {
    const [folder, file] = path.slice(CATALOG_PATH.length + 1).split("/");
    if (folder === undefined || file === undefined) continue;
    folders.set(folder, [...(folders.get(folder) ?? []), file].sort());
  }
  return folders;
}

describe("the fidelity pages", () => {
  // Fails if two entries share an ID, on one page or on two (say, a new
  // page numbering its entries from an ID another page already uses).
  it("give each entry an ID of its own", () => {
    const ids = Object.values(ENTRY_PAGES).flatMap(entryIdsOf);
    expect(ids.length).toBeGreaterThan(30);
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repeated).toEqual([]);
  });

  // Fails if FIDELITY_ID_PATTERN goes back to letters only: S3's entries
  // would drop out of every check that reads entries, without a failure.
  it("find IDs whose prefix holds a digit", () => {
    const s3 = ENTRY_PAGES["/docs/design/fidelity/s3/s3-fidelity.md"] ?? "";
    expect(entryIdsOf(s3)).toContain("S3-1");
  });

  // Fails if a page is added anywhere under docs/design/fidelity/ (say,
  // sqs/sqs-profile.md) and not listed on the index, or the index lists a
  // page that isn't there.
  it("are each listed on the index, and the index lists no others", () => {
    const listed = new Set(
      [...FIDELITY_INDEX.matchAll(/\]\(fidelity\/([\w/-]+\.md)\)/g)].map(
        (m) => `${CATALOG_PATH}/${m[1] ?? ""}`,
      ),
    );
    expect(listed.size).toBeGreaterThan(12);
    expect([...listed].sort()).toEqual(Object.keys(CATALOG_PAGES).sort());
  });

  // Fails if a type's folder lacks its profile or its entries, or holds a
  // page named for another type or for neither (say, rds/rds.md, or
  // lambda/profile.md), which the profile and entry checks wouldn't read.
  it("give each type a folder with its profile and its entries, and nothing else", () => {
    const folders = filesByFolder();
    expect(folders.size).toBeGreaterThan(5);
    for (const [type, files] of folders) {
      expect(files, type).toEqual([
        `${type}-fidelity.md`,
        `${type}-profile.md`,
      ]);
    }
  });

  // Fails if a type's entry page keeps a defaults table (say, the split
  // leaves Lambda's in lambda-fidelity.md), whose rows no check reads, or a
  // profile holds an entry, which no entry check reads.
  it("keep defaults in the profiles and entries in the entry pages", () => {
    const typeEntryPages = Object.entries(ENTRY_PAGES).filter(
      ([path]) => path !== ENGINE_PAGE_PATH,
    );
    for (const [path, page] of typeEntryPages) {
      expect(defaultsRowsOf(page), path).toEqual([]);
    }
    for (const [path, page] of Object.entries(PROFILE_PAGES)) {
      expect(entryIdsOf(page), path).toEqual([]);
      expect(defaultsRowsOf(page).length, path).toBeGreaterThan(0);
    }
  });

  // Fails if a doc links to a page or heading that isn't there (say, the
  // old fidelity/sqs.md#sqs-1-… after the move, or a heading since
  // reworded), unless the doc is an ADR and a later addendum links the
  // entry where it is. Also fails if that addendum's own link names a page
  // or heading that doesn't exist (say, ADR-0017's addendum linking SQS-1
  // on sqs/sqz-fidelity.md).
  it("are linked from the docs only at pages and headings that exist", () => {
    const links = Object.entries(DOCS)
      .flatMap(fidelityLinksIn)
      .filter((link) => !keptByAddendum(link));
    expect(links.filter((l) => l.anchor !== "").length).toBeGreaterThan(10);
    for (const { from, path, anchor } of links) {
      const page = ALL_PAGES[path];
      expect(page, `${from} → ${path}`).toBeDefined();
      if (anchor === "") continue;
      expect(
        anchorsOf(page ?? "").has(anchor),
        `${from} → ${path}#${anchor}`,
      ).toBe(true);
    }
  });
});
