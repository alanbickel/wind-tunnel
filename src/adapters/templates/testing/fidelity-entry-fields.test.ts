import { describe, expect, it } from "vitest";
import { entriesOf, entryFieldProblems } from "./fidelity-entry-fields";
import { FIDELITY_PAGES } from "./fidelity-pages";

// Each fidelity entry is a tracked gap (#285): it says whether it's open or
// accepted, what kind of gap it is, what closing it needs, and when its
// evidence was last checked.

const FIELDS = {
  status: "- **Status:** Open",
  kind: "- **Kind:** Behavior",
  dependsOn: "- **Depends on:** Nothing; no Roadmap item yet.",
  checked: "- **Checked:** 2026-10-14",
};

/** A one-entry page with the given field lines, then the entry's description. */
function pageWith(fields: Partial<typeof FIELDS>): string {
  return [
    "#### XYZ-1: Something differs",
    "",
    ...Object.values(fields),
    "- **Wind Tunnel:** does one thing.",
    "",
    "## Default values and their evidence",
  ].join("\n");
}

/** The problems with a one-entry page's fields. */
function problemsWith(fields: Partial<typeof FIELDS>): string[] {
  return entriesOf(pageWith(fields)).flatMap(entryFieldProblems);
}

describe("each fidelity entry's fields", () => {
  // Fails if an entry on any page loses one of its four fields, or one of
  // them stops being well formed (say, LMB-3's Kind written "Both").
  it("are on every entry of every page, each well formed", () => {
    const entries = Object.values(FIDELITY_PAGES).flatMap(entriesOf);
    expect(entries.length).toBeGreaterThan(30);
    expect(entries.flatMap(entryFieldProblems)).toEqual([]);
  });

  // Fails if entriesOf stops finding entries, or the checker rejects a
  // well-formed entry, which would make every case below pass for nothing.
  it("pass for an entry with all four, Open or Accepted with a reason", () => {
    expect(problemsWith(FIELDS)).toEqual([]);
    const accepted = { ...FIELDS, status: "- **Status:** Accepted: Minor." };
    expect(problemsWith(accepted)).toEqual([]);
  });

  // Fails if the checker stops requiring a field, or stops checking the
  // value of Status, Kind, or Checked against what "How to read an entry"
  // allows (say, accepting "Accepted:" with no reason, or 2026-02-30).
  it.each([
    ["no Status", { status: undefined }, "XYZ-1: no Status"],
    [
      "a status other than the two",
      { status: "- **Status:** Closed" },
      'XYZ-1: Status "Closed"',
    ],
    [
      "Accepted with no reason",
      { status: "- **Status:** Accepted:" },
      'XYZ-1: Status "Accepted:"',
    ],
    ["no Kind", { kind: undefined }, "XYZ-1: no Kind"],
    [
      "a kind other than the two",
      { kind: "- **Kind:** Both" },
      'XYZ-1: Kind "Both"',
    ],
    ["no Depends on", { dependsOn: undefined }, "XYZ-1: no Depends on"],
    [
      "an empty Depends on",
      { dependsOn: "- **Depends on:**" },
      'XYZ-1: Depends on ""',
    ],
    ["no Checked", { checked: undefined }, "XYZ-1: no Checked"],
    [
      "a date not in YYYY-MM-DD",
      { checked: "- **Checked:** 2026-10-1" },
      'XYZ-1: Checked "2026-10-1"',
    ],
    [
      "a day that doesn't exist",
      { checked: "- **Checked:** 2026-02-30" },
      'XYZ-1: Checked "2026-02-30"',
    ],
    [
      "a month that doesn't exist",
      { checked: "- **Checked:** 2026-13-01" },
      'XYZ-1: Checked "2026-13-01"',
    ],
  ])("fail for %s", (_case, change, problem) => {
    const fields = Object.fromEntries(
      Object.entries({ ...FIELDS, ...change }).filter(
        ([, line]) => line !== undefined,
      ),
    );
    expect(problemsWith(fields)).toEqual([problem]);
  });
});
