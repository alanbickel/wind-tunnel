import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import { simulateWithMetrics } from "../../domain/metrics/metrics-collector";
import { loadProject } from "../persistence/load-project";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";

// The report derives "in progress", "unfinished", and "being delivered" by
// subtraction and tells readers the sums add up. These tests check each
// derived number against an independent one, so a counting bug shows up
// here instead of being absorbed into the remainder.

const registry = createAwsComponentRegistry();

function run(template: unknown) {
  const loaded = loadProject(template, registry);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  const { project } = loaded.record;
  const workloadId = project.workloads[0]?.id ?? "";
  return { project, ...simulateWithMetrics({ project, workloadId, registry }) };
}

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s's totals reconcile", (_, template) => {
  const { project, totals, snapshots } = run(template);

  it("leaves some work unfinished, so the checks below mean something", () => {
    const api = totals.components.api;
    expect(api?.inProgress).toBeGreaterThan(0);
  });

  it("matches each component's unfinished work to its state at the end", () => {
    for (const component of project.architecture.components) {
      const m = totals.components[component.id];
      if (m === undefined) throw new Error(component.id);
      const unfinished = m.arrivals - m.completed - m.failed - m.rejected;
      // A queue's backlog holds messages whose send already finished.
      const waiting = registry.get(component.type)?.deliversAsync
        ? 0
        : m.queueDepth;
      expect(unfinished, component.id).toBe(m.inProgress + waiting);
    }
  });

  it("matches workflows in progress to requests unfinished at the entry point", () => {
    // Every workflow starts at `api` with no retries, so each user request
    // is exactly one arrival there.
    const inProgress = Object.values(totals.workflows).reduce(
      (n, w) => n + w.started - w.succeeded - w.failed,
      0,
    );
    const api = totals.components.api;
    if (api === undefined) throw new Error("api");
    expect(api.arrivals).toBe(
      Object.values(totals.workflows).reduce((n, w) => n + w.started, 0),
    );
    expect(inProgress).toBe(api.inProgress);
  });

  it("adds up the per-second rows to the totals", () => {
    for (const [id, w] of Object.entries(totals.workflows)) {
      const rows = snapshots.map((s) => s.workflows[id]);
      expect(rows.reduce((n, r) => n + (r?.started ?? 0), 0)).toBe(w.started);
      expect(rows.reduce((n, r) => n + (r?.succeeded ?? 0), 0)).toBe(
        w.succeeded,
      );
      expect(rows.reduce((n, r) => n + (r?.failed ?? 0), 0)).toBe(w.failed);
    }
  });
});

describe("template-b's queue", () => {
  it("is delivering exactly the messages its consumer is working on", () => {
    const { totals } = run(templateB);
    const queue = totals.components["orders-queue"];
    const consumer = totals.components["fn-writer"];
    if (queue === undefined || consumer === undefined) throw new Error();
    const delivering =
      queue.completed - queue.asyncSucceeded - queue.queueDepth;
    // fn-writer is called only by the queue's deliveries.
    expect(delivering).toBe(consumer.inProgress + consumer.queueDepth);
    expect(delivering).toBeGreaterThan(0);
  });
});
