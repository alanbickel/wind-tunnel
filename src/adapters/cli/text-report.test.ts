import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type { ComponentMetrics } from "../../domain/metrics/metrics-collector";
import { sampleRecord } from "../../application/testing/sample-record";
import { sampleSnapshot } from "../../application/testing/sample-snapshots";
import { formatReport } from "./text-report";

const { project } = sampleRecord;
const registry = createAwsComponentRegistry();

/** The report of a one-second run of `sampleRecord` with `fn`'s numbers. */
function reportWithFn(fn: Partial<ComponentMetrics>): string {
  const [workload] = project.workloads;
  if (workload === undefined) throw new Error("sampleRecord has no workload");
  const snapshot = sampleSnapshot({ second: 1, fn });
  const run = { eventsProcessed: 0, snapshots: [snapshot], totals: snapshot };
  return formatReport({ project, workload, run, registry });
}

describe("formatReport's Components table", () => {
  // Fails if the causes are listed in the order they were recorded instead
  // of most first, joined with anything but "; ", or name their component
  // by ID ("fn") rather than by name ("Function").
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
      "async failed=5 (Function: timeout 3; Table: throttled 2)",
    );
  });
});
