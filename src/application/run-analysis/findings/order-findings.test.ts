import { describe, expect, it } from "vitest";
import { sampleFinding, sampleKey } from "../../testing/sample-findings";
import type { Finding, Fix } from "./finding";
import { say } from "./message";
import { orderFindings, type FindingNode } from "./order-findings";

/** Each node's kind, with its causes' kinds nested beneath it. */
interface Tree {
  readonly kind: string;
  readonly causes: readonly Tree[];
}

function treeOf(nodes: readonly FindingNode[]): Tree[] {
  return nodes.map((n) => ({
    kind: n.finding.key.kind,
    causes: treeOf(n.causes),
  }));
}

/** A sample finding whose key's kind is `kind`. */
function finding(kind: string, overrides: Partial<Finding> = {}): Finding {
  return sampleFinding({ key: sampleKey(kind), ...overrides });
}

const later = { fromMs: 2_000, toMs: 3_000 };

function fix(text: string): Fix {
  return {
    scope: "wind-tunnel",
    message: say`${text}`,
    claim: { kind: "assumption" },
    fidelityIds: [],
  };
}

describe("orderFindings", () => {
  // Fails if any ordering key is skipped or reversed, or if an uncounted
  // warning sorts before a counted one.
  it("orders by severity, then affected, then window start, then key", () => {
    const findings = [
      finding("note", { severity: "note", affected: 1_000 }),
      finding("warning-uncounted", { severity: "warning" }),
      finding("warning-counted", { severity: "warning", affected: 5 }),
      finding("failure-b", {
        severity: "failure",
        affected: 10,
        window: later,
      }),
      finding("failure-a", {
        severity: "failure",
        affected: 10,
        window: later,
      }),
      finding("failure-early", { severity: "failure", affected: 10 }),
      finding("failure-most", { severity: "failure", affected: 20 }),
    ];
    expect(orderFindings(findings).map((n) => n.finding.key.kind)).toEqual([
      "failure-most",
      "failure-early",
      "failure-a",
      "failure-b",
      "warning-counted",
      "warning-uncounted",
      "note",
    ]);
  });

  // Fails if the tiebreak stops after the kind, or compares the fields in
  // another order, or sorts a missing field after a present one.
  it("breaks a tie on the key field by field, a missing field first", () => {
    const at = (componentId: string, limitName?: string): Finding =>
      sampleFinding({
        key: { kind: "same", componentId, reason: undefined, limitName },
      });
    const findings = [at("b"), at("a", "z"), at("a", "y"), at("a")];
    expect(
      orderFindings(findings).map(
        (n) => `${n.finding.key.componentId} ${n.finding.key.limitName ?? "-"}`,
      ),
    ).toEqual(["a -", "a y", "a z", "b -"]);
  });

  // Fails if a cited finding also shows at the top level, or if a causedBy
  // key that no finding has adds an empty node or throws.
  it("nests each cause beneath the finding that cites it", () => {
    const findings = [
      finding("cause"),
      finding("failure", {
        severity: "failure",
        causedBy: [sampleKey("cause"), sampleKey("missing")],
      }),
    ];
    expect(treeOf(orderFindings(findings))).toEqual([
      { kind: "failure", causes: [{ kind: "cause", causes: [] }] },
    ]);
  });

  // Fails if a cycle of causes hides both findings or never ends.
  it("breaks a cycle of causes where it's first met", () => {
    const findings = [
      finding("b", { causedBy: [sampleKey("a")] }),
      finding("a", { causedBy: [sampleKey("b")] }),
    ];
    expect(treeOf(orderFindings(findings))).toEqual([
      { kind: "a", causes: [{ kind: "b", causes: [] }] },
    ]);
  });

  // Fails if a cause repeats a fix or the Learn more its parent shows, or
  // loses one its parent doesn't show.
  it("leaves out of a cause the fixes and Learn more shown above it", () => {
    const shared = fix("Raise the workers.");
    const own = fix("Watch the queue.");
    const findings = [
      finding("cause", { fixes: [shared, own], learnMore: "anchor" }),
      finding("failure", {
        severity: "failure",
        fixes: [shared],
        learnMore: "anchor",
        causedBy: [sampleKey("cause")],
      }),
    ];
    const [top] = orderFindings(findings);
    expect(top?.finding.fixes).toEqual([shared]);
    expect(top?.causes[0]?.finding).toMatchObject({
      fixes: [own],
      learnMore: undefined,
    });
  });

  // Fails if a finding at the top level loses fixes it shares with nothing
  // above it.
  it("keeps every fix of a finding with nothing above it", () => {
    const shared = fix("Raise the workers.");
    const [top] = orderFindings([
      finding("note", { fixes: [shared], learnMore: "anchor" }),
    ]);
    expect(top?.finding).toMatchObject({
      fixes: [shared],
      learnMore: "anchor",
    });
  });
});
