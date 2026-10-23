import { describe, expect, it } from "vitest";
import type { Fix } from "../../application/run-analysis/findings/finding";
import {
  at,
  component,
  count,
  duration,
  say,
  share,
} from "../../application/run-analysis/findings/message";
import type { FindingNode } from "../../application/run-analysis/findings/order-findings";
import type { Verdict } from "../../application/run-analysis/findings/verdict";
import { sampleFinding } from "../../application/testing/sample-findings";
import { formatFindings } from "./findings-report";

const verdict: Verdict = {
  level: "failing",
  finished: true,
  title: "Failing",
  requests: {
    id: "all",
    label: "All workflows",
    started: 0,
    succeeded: 0,
    failed: 0,
    inProgress: 0,
  },
  summary: [],
  headroom: undefined,
  noHeadroom: [],
  noHeadroomLine: undefined,
  headroomLine: undefined,
};

const documented: Fix = {
  scope: "aws",
  message: say`Add RDS Proxy.`,
  claim: { kind: "documented", title: "RDS Proxy", url: "https://x.test" },
  fidelityIds: ["RDS-2"],
};

const assumed: Fix = {
  scope: "wind-tunnel",
  message: say`Raise the pool to ${count(2_000)}.`,
  claim: { kind: "assumption" },
  fidelityIds: [],
};

const observed: Fix = {
  scope: "wind-tunnel",
  message: say`Add workers.`,
  claim: { kind: "observed", file: "src/x.test.ts", test: "waits" },
  fidelityIds: [],
};

// A failure with a cause window and a note beneath it, then a warning.
const findings: FindingNode[] = [
  {
    finding: sampleFinding({
      severity: "failure",
      summary: say`${count(1_234)} requests failed with ${component("orders-db")}.`,
      reasons: [say`It held all ${count(90)} connections.`],
      causeWindow: { fromMs: 11_000, toMs: 47_000 },
      fixes: [documented, assumed],
      learnMore: "rds-connections",
    }),
    causes: [
      {
        finding: sampleFinding({
          summary: say`Queries waited up to ${duration(450)} at ${at(14_000)}.`,
          fixes: [observed],
        }),
        causes: [],
      },
    ],
  },
  {
    finding: sampleFinding({
      severity: "warning",
      summary: say`Work landed up to ${duration(32_800)} late, in ${share(0.1449)} of seconds.`,
    }),
    causes: [],
  },
];

describe("formatFindings", () => {
  // Fails if a cause isn't numbered under its finding ("1.1") or indented
  // past its number, the cause line or a claim's text is dropped, a
  // severity gets the wrong label, or a duration under a second isn't in
  // milliseconds.
  it("numbers the findings, nests causes beneath them, and prints each part", () => {
    expect(formatFindings({ verdict, findings })).toBe(
      [
        "1. Failure: 1,234 requests failed with orders-db.",
        "   - It held all 90 connections.",
        "   Cause began at 11 s.",
        "   Fixes:",
        "   - In AWS: Add RDS Proxy. (Documented: RDS Proxy, https://x.test; fidelity RDS-2)",
        "   - In Wind Tunnel: Raise the pool to 2,000. (Assumption)",
        "   Learn more: docs/learning/aws-did-you-know.md#rds-connections",
        "   1.1. Note: Queries waited up to 450 ms at 14 s.",
        "        Fixes:",
        '        - In Wind Tunnel: Add workers. (Observed: src/x.test.ts, "waits")',
        "",
        "2. Warning: Work landed up to 32.8 s late, in 14.4% of seconds.",
      ].join("\n"),
    );
  });

  // Fails if a run without findings prints an empty section.
  it("says None. when there are no findings", () => {
    expect(formatFindings({ verdict, findings: [] })).toBe("None.");
  });
});
