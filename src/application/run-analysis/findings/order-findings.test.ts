import { describe, expect, it } from "vitest";
import { sampleFinding } from "../../testing/sample-findings";
import { orderFindings, type FindingNode } from "./order-findings";

/** Each node's ID, with its causes' IDs nested beneath it. */
type Tree = [string, Tree[]];

function treeOf(nodes: readonly FindingNode[]): Tree[] {
  return nodes.map((n) => [n.finding.id, treeOf(n.causes)]);
}

const later = { fromMs: 2_000, toMs: 3_000 };

describe("orderFindings", () => {
  // Fails if any ordering key is skipped or reversed, or if an uncounted
  // warning sorts before a counted one.
  it("orders by severity, then affected, then window start, then ID", () => {
    const findings = [
      sampleFinding({ id: "note", severity: "note", affected: 1_000 }),
      sampleFinding({ id: "warning-uncounted", severity: "warning" }),
      sampleFinding({
        id: "warning-counted",
        severity: "warning",
        affected: 5,
      }),
      sampleFinding({
        id: "failure-b",
        severity: "failure",
        affected: 10,
        window: later,
      }),
      sampleFinding({
        id: "failure-a",
        severity: "failure",
        affected: 10,
        window: later,
      }),
      sampleFinding({ id: "failure-early", severity: "failure", affected: 10 }),
      sampleFinding({ id: "failure-most", severity: "failure", affected: 20 }),
    ];
    expect(orderFindings(findings).map((n) => n.finding.id)).toEqual([
      "failure-most",
      "failure-early",
      "failure-a",
      "failure-b",
      "warning-counted",
      "warning-uncounted",
      "note",
    ]);
  });

  // Fails if a cited finding also shows at the top level, or if a causedBy
  // ID that no finding has adds an empty node or throws.
  it("nests each cause beneath the finding that cites it", () => {
    const findings = [
      sampleFinding({ id: "cause", severity: "note" }),
      sampleFinding({
        id: "failure",
        severity: "failure",
        causedBy: ["cause", "missing"],
      }),
    ];
    expect(treeOf(orderFindings(findings))).toEqual([
      ["failure", [["cause", []]]],
    ]);
  });

  // Fails if a cycle of causes hides both findings or never ends.
  it("breaks a cycle of causes where it's first met", () => {
    const findings = [
      sampleFinding({ id: "b", causedBy: ["a"] }),
      sampleFinding({ id: "a", causedBy: ["b"] }),
    ];
    expect(treeOf(orderFindings(findings))).toEqual([["a", [["b", []]]]]);
  });
});
