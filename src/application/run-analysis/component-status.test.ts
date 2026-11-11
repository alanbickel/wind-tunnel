import { describe, expect, it } from "vitest";
import type { LimitUse } from "../../domain/metrics/metrics-snapshot";
import { sampleRecord } from "../testing/sample-record";
import { sampleSnapshot } from "../testing/sample-snapshots";
import { componentStatuses } from "./component-status";

const { project } = sampleRecord;

/** A concurrency limit of 10 that makes work wait when full. */
const waitLimit = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "workers",
  whenFull: { kind: "wait", holds: undefined },
  limit: 10,
  current: 0,
  peak,
});

/** A concurrency limit of 10 that refuses work when full. */
const refuseLimit = (peak: number): LimitUse => ({
  kind: "concurrency",
  name: "concurrency",
  whenFull: { kind: "refuse", reason: "throttled" },
  limit: 10,
  current: 0,
  peak,
});

function statusesOf(...seconds: Parameters<typeof sampleSnapshot>[0][]) {
  const snapshots = seconds.map((second) => sampleSnapshot(second));
  return Object.fromEntries(
    componentStatuses({ project, workloadId: "steady", snapshots }),
  );
}

describe("componentStatuses", () => {
  // Fails if a component that rejected nothing is called refused, or if one
  // that did is called ok.
  it("calls a component refused once its totals show a rejection, in any second", () => {
    const statuses = statusesOf(
      { second: 1, fn: { arrivals: 5, completed: 5 } },
      { second: 2, fn: { arrivals: 5, completed: 3, rejected: 2 } },
    );

    expect(statuses).toEqual({ api: "ok", fn: "refused", table: "ok" });
  });

  // Fails if waited needs more than a wait limit at its peak, or if a limit
  // that refuses when full counts as waiting.
  it("calls a component waited when a wait limit ran out, and nothing was refused", () => {
    const statuses = statusesOf({
      second: 1,
      fn: { limits: [waitLimit(10)] },
      table: { limits: [refuseLimit(10)] },
    });

    expect(statuses).toEqual({ api: "ok", fn: "waited", table: "ok" });
  });

  // Fails if a wait limit short of its size counts as waiting.
  it("calls a component ok when its wait limit never ran out", () => {
    const statuses = statusesOf({
      second: 1,
      fn: { limits: [waitLimit(9)] },
    });

    expect(statuses.fn).toBe("ok");
  });

  // Fails if waited outranks refused: the component that lost requests
  // must read as refused.
  it("calls a component refused when it both waited and refused", () => {
    const statuses = statusesOf({
      second: 1,
      fn: { rejected: 1, arrivals: 1, limits: [waitLimit(10)] },
    });

    expect(statuses.fn).toBe("refused");
  });

  // Fails if a component with no limits throws or is left out.
  it("gives a component with no limits a status, ok if it rejected nothing", () => {
    expect(statusesOf({ second: 1 })).toEqual({
      api: "ok",
      fn: "ok",
      table: "ok",
    });
  });

  // Fails if a run with no snapshots yet leaves components without a status.
  it("calls every component ok before the first snapshot", () => {
    expect(statusesOf()).toEqual({ api: "ok", fn: "ok", table: "ok" });
  });
});
