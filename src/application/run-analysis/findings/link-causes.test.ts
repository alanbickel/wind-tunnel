import { describe, expect, it } from "vitest";
import { sampleFinding } from "../../testing/sample-findings";
import type { DetectedFinding, Explains, FindingKey } from "./finding";
import { findingKey } from "./finding-key";
import { linkCauses } from "./link-causes";

/** A finding with `key`, about `limitNames`, explaining nothing. */
function about(
  key: FindingKey,
  limitNames: readonly string[] = [],
): DetectedFinding {
  return sampleFinding({ key, limitNames });
}

/** A note of `kind` at `explains.componentId` that explains `explains`. */
function note(kind: string, explains: Explains): DetectedFinding {
  return sampleFinding({
    key: findingKey({ kind, componentId: explains.componentId }),
    explains,
  });
}

const refused = findingKey({
  kind: "failed",
  componentId: "db",
  reason: "too-many-connections",
});

/** Each finding's kind, with the kinds of the findings linked beneath it. */
function causesByKind(
  findings: readonly DetectedFinding[],
): [string, string[]][] {
  return linkCauses(findings).map((f) => [
    f.key.kind,
    f.causedBy.map((k) => k.kind),
  ]);
}

describe("linkCauses", () => {
  // Fails if a note is linked beneath a finding about another limit of the
  // same component, or one at another component.
  it("links a note that names a limit only beneath findings about that limit", () => {
    const findings = [
      about(refused, ["connections"]),
      about(findingKey({ kind: "other-limit", componentId: "db" }), ["cpu"]),
      about(findingKey({ kind: "elsewhere", componentId: "fn" }), [
        "connections",
      ]),
      note("waiting", { componentId: "db", limitName: "connections" }),
    ];
    expect(causesByKind(findings)).toEqual([
      ["failed", ["waiting"]],
      ["other-limit", []],
      ["elsewhere", []],
      ["waiting", []],
    ]);
  });

  // Fails if a note that names no limit is linked only beneath findings
  // about some limit: a timeout is about its component, not a limit.
  it("links a note that names no limit beneath every finding at its component", () => {
    const timeout = findingKey({ kind: "timeout", componentId: "db" });
    const findings = [
      about(timeout),
      about(refused, ["connections"]),
      note("slow", { componentId: "db", limitName: undefined }),
    ];
    expect(causesByKind(findings)).toEqual([
      ["timeout", ["slow"]],
      ["failed", ["slow"]],
      ["slow", []],
    ]);
  });

  // Fails if a note that explains its own limit is linked beneath itself.
  it("never links a finding beneath itself", () => {
    const drained = sampleFinding({
      key: findingKey({ kind: "drained", componentId: "db" }),
      limitNames: ["readUnits"],
      explains: { componentId: "db", limitName: "readUnits" },
    });
    expect(causesByKind([drained])).toEqual([["drained", []]]);
  });

  // Fails if `causedBy` follows the detectors' order rather than the keys',
  // so the same findings from detectors listed in another order differ.
  it("sorts each finding's causes by key", () => {
    const explains = { componentId: "db", limitName: "connections" };
    const findings = [
      about(refused, ["connections"]),
      note("b-note", explains),
      note("a-note", explains),
    ];
    expect(causesByKind(findings)[0]).toEqual(["failed", ["a-note", "b-note"]]);
  });
});
