import { describe, expect, it } from "vitest";
import { sampleFinding, sampleKey } from "../../testing/sample-findings";
import type { Finding, Fix } from "./finding";
import { say } from "./message";
import { orderFindings } from "./order-findings";
import { suggestedFixes } from "./suggested-fixes";

function fix(text: string): Fix {
  return {
    scope: "wind-tunnel",
    message: say`${text}`,
    claim: { kind: "assumption" },
    fidelityIds: [],
  };
}

/** A sample finding whose key's kind is `kind`, with these fixes. */
function finding(
  kind: string,
  overrides: Partial<Finding> & Pick<Finding, "fixes">,
): Finding {
  return sampleFinding({ key: sampleKey(kind), ...overrides });
}

/** The fixes the findings suggest, once ordered as a run orders them. */
function fixesOf(findings: readonly Finding[]): Fix[] {
  return suggestedFixes({ findings: orderFindings(findings) });
}

describe("suggestedFixes", () => {
  // Fails if the fixes aren't deduplicated, or are deduplicated by
  // something other than the catalog's object.
  it("lists a fix two findings share once", () => {
    const shared = fix("Raise the limit");
    const findings = [
      finding("failure", { severity: "failure", fixes: [shared] }),
      finding("warning", { severity: "warning", fixes: [shared] }),
    ];
    expect(fixesOf(findings)).toEqual([shared]);
  });

  // Fails if a cause note's fixes are skipped, or if one its finding
  // already shows is listed again.
  it("lists a cause note's fix that its finding shows once, with the note's own", () => {
    const shared = fix("Raise the limit");
    const own = fix("Add a queue");
    const cause = finding("cause", { severity: "note", fixes: [shared, own] });
    const failure = finding("failure", {
      severity: "failure",
      fixes: [shared],
      causedBy: [cause.key],
    });
    expect(fixesOf([cause, failure])).toEqual([shared, own]);
  });

  // Fails if the fixes follow the input's order, or list the causes'
  // fixes after every top-level finding's, rather than the findings'
  // order, depth first.
  it("follows the findings' order, each finding's causes beneath it", () => {
    const [a, b, c] = [fix("a"), fix("b"), fix("c")];
    const cause = finding("cause", { severity: "note", fixes: [b] });
    const findings = [
      finding("warning", { severity: "warning", fixes: [c] }),
      cause,
      finding("failure", {
        severity: "failure",
        fixes: [a],
        causedBy: [cause.key],
      }),
    ];
    expect(fixesOf(findings)).toEqual([a, b, c]);
  });

  // Fails if no findings, or findings without fixes, give anything but an
  // empty list.
  it("is empty with no findings, or none with fixes", () => {
    expect(fixesOf([])).toEqual([]);
    expect(fixesOf([finding("failure", { fixes: [] })])).toEqual([]);
  });
});
