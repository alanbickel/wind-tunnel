import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import { sampleRecord } from "../../application/testing/sample-record";
import { serveRun, type WorkerReply } from "./simulation-worker-protocol";

const registry = createAwsComponentRegistry();
const { project } = sampleRecord;

function serve(workloadId: string): WorkerReply[] {
  const replies: WorkerReply[] = [];
  serveRun({
    request: { project, workloadId },
    registry,
    post: (reply) => replies.push(reply),
  });
  return replies;
}

describe("serveRun", () => {
  it("posts each snapshot in order, then the whole run", () => {
    const run = simulateWithMetrics({
      project,
      workloadId: "steady",
      registry,
    });

    const replies = serve("steady");

    expect(replies).toEqual([
      ...run.snapshots.map((snapshot) => ({ kind: "snapshot", snapshot })),
      { kind: "finished", run },
    ]);
  });

  it("posts the engine's error message when the run fails", () => {
    expect(serve("nope")).toEqual([
      { kind: "failed", message: 'No workload "nope"' },
    ]);
  });

  it("posts only data that survives a structured clone", () => {
    const replies = serve("steady");

    expect(structuredClone(replies)).toEqual(replies);
  });
});
