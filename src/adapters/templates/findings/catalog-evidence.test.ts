import { describe, expect, it } from "vitest";
import { createFindingsCatalog } from "../../../application/run-analysis/findings/catalog/create-findings-catalog";
import type { Fix } from "../../../application/run-analysis/findings/finding";
import fidelityDoc from "../../../../docs/design/fidelity.md?raw";
import didYouKnowDoc from "../../../../docs/learning/aws-did-you-know.md?raw";

// Every fix in the catalog carries its evidence (findings.md §2.1). The
// types make a claim required; these tests check that each one points at
// something real: a link, a test that exists, a fidelity entry, and a
// Did-you-know heading.

/** The template tests' sources, keyed by their path from the repository. */
const TEST_SOURCES: Readonly<Record<string, string>> = import.meta.glob(
  "/src/adapters/templates/**/*.test.ts",
  { query: "?raw", import: "default", eager: true },
);

/** Each limit's and each finding kind's advice, labeled "type key". */
const entries = [...createFindingsCatalog().values()].flatMap((advice) =>
  Object.entries({ ...advice.limits, ...advice.kinds }).map(([key, entry]) => ({
    label: `${advice.type} ${key}`,
    entry,
  })),
);

/** Each fix, labeled by its limit and position. */
const fixes = entries.flatMap(({ label, entry }) =>
  entry.fixes.map((fix: Fix, i) => ({ label: `${label} #${String(i)}`, fix })),
);

/** The IDs of fidelity.md's entries, from headings like `#### RDS-2: …`. */
const FIDELITY_IDS = new Set(
  [...fidelityDoc.matchAll(/^#### ([A-Z]+-\d+):/gm)].map((m) => m[1]),
);

/** The anchors of aws-did-you-know.md's headings, as GitHub makes them. */
const LEARN_MORE_ANCHORS = new Set(
  [...didYouKnowDoc.matchAll(/^#+ (.+)$/gm)].map((m) => anchorOf(m[1] ?? "")),
);

function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replaceAll(" ", "-");
}

describe("the findings catalog", () => {
  // Fails if an entry is added with no fixes, a type with no limits, or a
  // finding kind's entry is left out of these checks.
  it("has advice for the limits and kinds the findings name", () => {
    expect(entries.map((e) => e.label)).toEqual([
      "rds connections",
      "rds queryWorkers",
      "sqs consumerConcurrency",
      "sqs failed-deliveries",
      "dynamodb readUnits",
    ]);
    for (const { label, entry } of entries) {
      expect(entry.fixes.length, label).toBeGreaterThan(0);
    }
  });

  // Fails if a Documented fix has an empty title or a link that isn't to
  // AWS's documentation.
  it("links every Documented fix to AWS's documentation", () => {
    for (const { label, fix } of fixes) {
      if (fix.claim.kind !== "documented") continue;
      expect(fix.claim.title, label).not.toBe("");
      expect(fix.claim.url, label).toMatch(
        /^https:\/\/docs\.aws\.amazon\.com\//,
      );
    }
  });

  // Fails if an Observed fix names a test file that doesn't exist, or a
  // test that isn't in it (say, after the test is renamed).
  it("names a test that exists for every Observed fix", () => {
    for (const { label, fix } of fixes) {
      if (fix.claim.kind !== "observed") continue;
      const source = TEST_SOURCES[`/${fix.claim.file}`];
      expect(source, label).toBeDefined();
      expect(source, label).toContain(`"${fix.claim.test}"`);
    }
  });

  // Fails if a fix cites a fidelity ID that fidelity.md doesn't have.
  it("cites only fidelity entries that exist", () => {
    expect(FIDELITY_IDS.size).toBeGreaterThan(30);
    for (const { label, fix } of fixes) {
      for (const id of fix.fidelityIds) {
        expect(FIDELITY_IDS.has(id), `${label}: ${id}`).toBe(true);
      }
    }
  });

  // Fails if a Learn-more anchor names a heading that isn't in
  // aws-did-you-know.md, as after a heading is reworded.
  it("points every Learn more at a Did-you-know heading", () => {
    for (const { label, entry } of entries) {
      if (entry.learnMore === undefined) continue;
      expect(LEARN_MORE_ANCHORS.has(entry.learnMore), label).toBe(true);
    }
  });
});
