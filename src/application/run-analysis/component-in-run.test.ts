import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import { sampleFinding, sampleRun } from "../testing/sample-findings";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { componentInRun, type ComponentInRun } from "./component-in-run";
import { componentStatuses } from "./component-status";
import type { Finding } from "./findings/finding";
import { findingKey } from "./findings/finding-key";
import type { FindingNode } from "./findings/order-findings";
import { verdictOf } from "./findings/verdict";
import type { RunSoFar } from "./run-so-far";

/** A concurrency limit of 10 that makes work wait when full, at its peak. */
const fullWaitLimit: LimitUse = {
  kind: "concurrency",
  name: "workers",
  whenFull: { kind: "wait", holds: undefined },
  limit: 10,
  current: 0,
  peak: 10,
};

/** A finding of `kind` at the component. */
function findingAt(componentId: string, kind: string): Finding {
  return sampleFinding({ key: findingKey({ kind, componentId }) });
}

/** A finding with the given causes beneath it. */
function node(finding: Finding, causes: FindingNode[] = []): FindingNode {
  return { finding, causes };
}

interface ReadInput {
  readonly run: RunSoFar;
  readonly componentId: string;
  readonly findings?: readonly FindingNode[];
  readonly going?: boolean;
}

/** The component's part of the run, with the findings given. */
function read({
  run,
  componentId,
  findings = [],
  going = false,
}: ReadInput): ComponentInRun {
  const all = findings.map((n) => n.finding);
  return componentInRun({
    run,
    findings: { verdict: verdictOf(run, all), findings },
    componentId,
    going,
  });
}

/** The sample's run, in which the function refused, the table waited, and the API did neither. */
const run = sampleRun([
  sampleSnapshot({
    second: 1,
    api: { arrivals: 5, completed: 5 },
    fn: { arrivals: 20_000, completed: 2, rejected: 19_998 },
    table: { limits: [fullWaitLimit] },
  }),
  sampleSnapshot({
    second: 2,
    fn: { arrivals: 8_843, rejected: 8_843 },
    table: { limits: [{ ...fullWaitLimit, peak: 3 }] },
  }),
]);

const keysOf = (part: ComponentInRun) =>
  part.kind === "ran" ? part.findings.map((f) => f.key.kind) : undefined;

describe("componentInRun", () => {
  // Fails if a status disagrees with `componentStatuses`, which draws the
  // badge and the Components row, or the refused count isn't the
  // component's whole run, added over every second.
  it.each([
    ["fn", "refused", "refused 28,841 attempts"],
    ["table", "waited", "waited"],
    ["api", "ok", "ok"],
  ] as const)("reads %s as %s, in the badge's word", (id, status, text) => {
    const part = read({ run, componentId: id });

    expect(part).toMatchObject({ kind: "ran", status, statusText: text });
    expect(componentStatuses(run).get(id)).toBe(status);
  });

  // Fails if the count's noun doesn't agree with it.
  it("says attempt for one refused", () => {
    const one = sampleRun([
      sampleSnapshot({ second: 1, fn: { arrivals: 1, rejected: 1 } }),
    ]);

    expect(read({ run: one, componentId: "fn" })).toMatchObject({
      statusText: "refused 1 attempt",
    });
  });

  // Fails if a finding at another component is listed, a cause is missed
  // because it's beneath another component's finding, a cause under two
  // findings is listed twice, or the order isn't the explanation's.
  it("lists the findings that name it, each once, in the explanation's order", () => {
    const shared = findingAt("fn", "shared-cause");
    const findings = [
      node(findingAt("table", "table-failed"), [
        node(findingAt("fn", "fn-cause")),
        node(shared),
      ]),
      node(findingAt("fn", "fn-failed"), [node(shared)]),
    ];

    expect(keysOf(read({ run, componentId: "fn", findings }))).toEqual([
      "fn-cause",
      "shared-cause",
      "fn-failed",
    ]);
    expect(keysOf(read({ run, componentId: "api", findings }))).toEqual([]);
  });

  // Fails if a run still going lists findings, or doesn't give the
  // status so far.
  it("gives the status so far and no findings while the run goes", () => {
    const findings = [node(findingAt("fn", "fn-failed"))];

    expect(read({ run, componentId: "fn", findings, going: true })).toEqual({
      kind: "ran",
      status: "refused",
      statusText: "refused 28,841 attempts",
      findings: [],
    });
  });

  // Fails if a component added since the run gets a status, which would
  // read as ok though nothing of it ran.
  it("says a component the run's copy doesn't have wasn't in the run", () => {
    expect(read({ run, componentId: "added-since" })).toEqual({
      kind: "not-in-run",
    });
  });
});
