import { describe, expect, it } from "vitest";
import type { ComponentMetrics } from "../../domain/metrics/metrics-collector";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { formatReport } from "./text-report";

const { project } = sampleRecord;

/** The report of a one-second run of `sampleRecord` with `fn`'s numbers. */
function reportWithFn(fn: Partial<ComponentMetrics>): string {
  const [workload] = project.workloads;
  if (workload === undefined) throw new Error("sampleRecord has no workload");
  const snapshot = sampleSnapshot({ second: 1, fn });
  const run = { eventsProcessed: 0, snapshots: [snapshot], totals: snapshot };
  return formatReport({ project, workload, run });
}

describe("formatReport's Components table", () => {
  // Fails if the causes are listed in the order they were recorded instead
  // of most first, or joined with anything but "; ".
  it("lists a component's failed deliveries by cause, most first", () => {
    // 10 messages, all delivered, 5 of them after a failed try.
    const report = reportWithFn({
      arrivals: 10,
      completed: 10,
      asyncSucceeded: 10,
      asyncFailed: 5,
      asyncFailures: { "table: throttled": 2, "fn: timeout": 3 },
    });
    expect(report).toContain(
      "async failed=5 (fn: timeout 3; table: throttled 2)",
    );
  });
});
