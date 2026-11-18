import { describe, expect, it } from "vitest";
import {
  anchorOf,
  entryIdsOf,
  FIDELITY_INDEX,
  FIDELITY_PAGES,
} from "./fidelity-pages";

// The fidelity catalog stays one catalog across its pages (#284): an ID
// names one entry, the index reaches every page, and the docs' links to an
// entry land on the page it's on.

const INDEX_PATH = "/docs/design/fidelity.md";

/** The Markdown that may link to a fidelity entry, keyed by its path. */
const DOCS: Readonly<Record<string, string>> = import.meta.glob(
  ["/docs/**/*.md", "/README.md", "/CONTRIBUTING.md"],
  { query: "?raw", import: "default", eager: true },
);

/** Each fidelity page's text, the index's included, keyed by its path. */
const ALL_PAGES: Readonly<Record<string, string>> = {
  [INDEX_PATH]: FIDELITY_INDEX,
  ...FIDELITY_PAGES,
};

/** A link to a fidelity page, as written and as resolved. */
interface FidelityLink {
  readonly from: string;
  readonly path: string;
  readonly anchor: string;
}

/** The links in a doc to a fidelity page, resolved from the doc's path. */
function fidelityLinksIn([from, text]: [string, string]): FidelityLink[] {
  return [...text.matchAll(/\]\(([^)\s#]*fidelity[^)\s#]*\.md)(#[^)\s]*)?\)/g)]
    .map((m) => new URL(`${m[1] ?? ""}${m[2] ?? ""}`, `file://${from}`))
    .map((url) => ({
      from,
      path: url.pathname,
      anchor: decodeURIComponent(url.hash.slice(1)),
    }));
}

/**
 * Whether a link is one an accepted ADR keeps as written, because an
 * addendum after it links the entry where it is now (documentation.md,
 * "ADRs").
 */
function keptByAddendum({ from, anchor }: FidelityLink): boolean {
  const addenda = (DOCS[from] ?? "").split("\n## Addendum").slice(1);
  return (
    from.startsWith("/docs/adr/") &&
    addenda.some((addendum) => addendum.includes(`#${anchor})`))
  );
}

/** The anchors of a page's headings, as GitHub makes them. */
function anchorsOf(page: string): Set<string> {
  return new Set(
    [...page.matchAll(/^#+ (.+)$/gm)].map((m) => anchorOf(m[1] ?? "")),
  );
}

describe("the fidelity pages", () => {
  // Fails if two entries share an ID, on one page or on two (say, a new
  // page numbering its entries from an ID another page already uses).
  it("give each entry an ID of its own", () => {
    const ids = Object.values(FIDELITY_PAGES).flatMap(entryIdsOf);
    expect(ids.length).toBeGreaterThan(30);
    const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(repeated).toEqual([]);
  });

  // Fails if a page is added to docs/design/fidelity/ and not listed on the
  // index, or the index lists a page that isn't there.
  it("are each listed on the index, and the index lists no others", () => {
    const listed = [...FIDELITY_INDEX.matchAll(/\]\(fidelity\/([\w-]+\.md)\)/g)]
      .map((m) => `/docs/design/fidelity/${m[1] ?? ""}`)
      .sort();
    expect(listed.length).toBeGreaterThan(5);
    expect(listed).toEqual(Object.keys(FIDELITY_PAGES).sort());
  });

  // Fails if a doc links to an entry on a page it isn't on (say, the old
  // fidelity.md#lmb-8-… after the split), or to a heading since reworded,
  // unless the doc is an ADR whose addendum links the entry where it is.
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
