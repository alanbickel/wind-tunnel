import { describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";
import { runTemplate } from "../templates/testing/run-template";

// The report derives "in progress", "unfinished", and "being delivered" by
// subtraction and tells readers the sums add up. These tests check each
// derived number against an independent one, so a counting bug shows up
// here instead of being absorbed into the remainder.

const registry = createAwsComponentRegistry();

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s's totals reconcile", (_, template) => {
  const { project, totals, snapshots } = runTemplate(template);

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
  // Run while collecting, as above: a whole-template run inside `it` counts
  // against the 5 s test timeout, which a busy parallel run can exceed (#15).
  const { totals } = runTemplate(templateB);

  it("is delivering exactly the messages its consumer is working on", () => {
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
