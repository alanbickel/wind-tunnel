import { beforeAll, describe, expect, it } from "vitest";
import { createAwsComponentRegistry } from "../../domain/components/aws";
import type {
  ComponentMetrics,
  LimitUse,
  MetricsRun,
  MetricsSnapshot,
} from "../../domain/metrics/metrics-collector";
import {
  componentIn,
  limitIn,
} from "../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../domain/model/project";
import templateA from "../templates/template-a.json";
import templateB from "../templates/template-b.json";
import { withMaxConnections } from "../templates/testing/rejection-runs";
import { RUN_TIMEOUT_MS, runTemplate } from "../templates/testing/run-template";
import { projectB, runScenario } from "../templates/testing/scenario-runs";
import { createDetectors } from "../../application/run-analysis/findings/create-detectors";
import { FAILED_DELIVERIES } from "../../application/run-analysis/findings/detectors/failed-deliveries";
import { findRun } from "../../application/run-analysis/findings/find-run";
import type { Finding } from "../../application/run-analysis/findings/finding";
import { formatReport } from "./text-report";

// The report derives "in progress", "unfinished", and "being delivered" by
// subtraction and tells readers the sums add up. These tests check each
// derived number against an independent one, so a counting bug shows up
// here instead of being absorbed into the remainder. Each component's
// limits get the same treatment: their use is checked against the limit
// and against a count of the same thing taken another way.

const registry = createAwsComponentRegistry();

/** A concurrency limit's use, counted from other fields of the window. */
type IndependentCount = (m: ComponentMetrics) => number;

// Lambda's slots and RDS's workers hold exactly the work in progress. An
// RDS connection is held by every running or waiting query.
const INDEPENDENT_USE: Readonly<Record<string, IndependentCount>> = {
  concurrency: (m) => m.inProgress,
  queryWorkers: (m) => m.inProgress,
  connections: (m) => m.inProgress + m.queueDepth,
};

// Where a limit holds exactly the work in progress, its peak is that peak.
const INDEPENDENT_PEAK: Readonly<Record<string, IndependentCount>> = {
  concurrency: (m) => m.peakInProgress,
  queryWorkers: (m) => m.peakInProgress,
};

/** One limit of one component in one snapshot. */
interface LimitInWindow {
  readonly snapshot: MetricsSnapshot;
  readonly metrics: ComponentMetrics;
  readonly limit: LimitUse;
  /** Names the limit and window in a failure message. */
  readonly where: string;
}

/** Every limit of every component in every snapshot. */
function everyLimit(snapshots: readonly MetricsSnapshot[]): LimitInWindow[] {
  return snapshots.flatMap((snapshot) =>
    Object.entries(snapshot.components).flatMap(([id, metrics]) =>
      metrics.limits.map((limit) => ({
        snapshot,
        metrics,
        limit,
        where: `${id} ${limit.name} at ${String(snapshot.endMs)} ms`,
      })),
    ),
  );
}

const windowSec = (s: MetricsSnapshot) => (s.endMs - s.startMs) / 1000;

describe.each([
  ["template-a", templateA],
  ["template-b", templateB],
])("%s's totals reconcile", (_, template) => {
  let project: Project;
  let totals: MetricsSnapshot;
  let snapshots: readonly MetricsSnapshot[];
  beforeAll(() => {
    ({ project, totals, snapshots } = runTemplate(template));
  }, RUN_TIMEOUT_MS);

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

  // Fails if a limit's peak stops covering its use: with the engine no
  // longer tracking it after each call, and the tick no longer raising it to
  // the use at the window's end, a peak reads under the end.
  it("never uses more of a limit than it allows", () => {
    for (const { limit, where } of everyLimit(snapshots)) {
      expect(limit.current, where).toBeGreaterThanOrEqual(0);
      expect(limit.current, where).toBeLessThanOrEqual(limit.peak);
      expect(limit.peak, where).toBeLessThanOrEqual(limit.limit);
    }
  });

  // Fails if a component reports the wrong slots as in use, or the engine
  // stops tracking a limit's peak after every call.
  it("matches each concurrency limit's use to an independent count", () => {
    const counted = everyLimit(snapshots).filter(
      ({ limit }) => INDEPENDENT_USE[limit.name] !== undefined,
    );
    for (const { metrics, limit, where } of counted) {
      expect(limit.current, where).toBe(INDEPENDENT_USE[limit.name]?.(metrics));
      const peak = INDEPENDENT_PEAK[limit.name];
      if (peak === undefined) continue;
      expect(limit.peak, where).toBe(peak(metrics));
    }
    expect(counted.length).toBeGreaterThanOrEqual(snapshots.length * 2);
  });

  // Fails if a rate limit stops counting admitted requests as tokens taken.
  // Neither template throttles, so counting throttled requests as taken can't
  // turn this red; token-bucket.test.ts and api-gateway.test.ts cover that.
  it("takes one rate token for each request a rate-limited component admits", () => {
    const windows = snapshots.flatMap((snapshot) =>
      Object.entries(snapshot.components).map(([id, metrics]) => ({
        metrics,
        rates: metrics.limits.flatMap((l) => (l.kind === "rate" ? [l] : [])),
        where: `${id} at ${String(snapshot.endMs)} ms`,
        sec: windowSec(snapshot),
      })),
    );
    const rateLimited = windows.filter((w) => w.rates.length > 0);
    for (const { metrics, rates, where, sec } of rateLimited) {
      const taken = rates.reduce((n, l) => n + l.takenPerSec, 0) * sec;
      expect(taken, where).toBeCloseTo(metrics.arrivals - metrics.rejected, 6);
    }
    expect(rateLimited.length).toBeGreaterThanOrEqual(snapshots.length);
  });

  // Fails if the totals stop keeping each limit's highest peak, or its
  // value at the end of the run.
  it("reports each limit's highest peak and latest use in the totals", () => {
    const last = snapshots.at(-1);
    if (last === undefined) throw new Error("no snapshots");
    const limits = Object.entries(totals.components).flatMap(([id, c]) =>
      c.limits.map((limit) => ({ id, limit })),
    );
    for (const { id, limit } of limits) {
      const peaks = snapshots.map(
        (s) => limitIn(componentIn(s, id), limit.name).peak,
      );
      const where = `${id} ${limit.name}`;
      expect(limit.peak, where).toBe(Math.max(...peaks));
      expect(limit.current, where).toBe(
        limitIn(componentIn(last, id), limit.name).current,
      );
    }
  });
});

describe("template-b's queue", () => {
  let totals: MetricsSnapshot;
  beforeAll(() => {
    ({ totals } = runTemplate(templateB));
  }, RUN_TIMEOUT_MS);

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

  // Fails if SQS stops counting a delivery against its consumer limit while
  // the delivery is in flight.
  it("holds a consumer slot for each message being delivered", () => {
    const queue = componentIn(totals, "orders-queue");
    const delivering =
      queue.completed - queue.asyncSucceeded - queue.queueDepth;
    expect(limitIn(queue, "consumerConcurrency").current).toBe(delivering);
    expect(delivering).toBeGreaterThan(0);
  });
});

// findings.md §1.8: Template B's lunch rush with orders-db cut to 10
// connections. No shipped run has a failed delivery, so this variant is the
// one that gives the failed-delivery counts something to reconcile.
describe("template-b's failed deliveries, with 10 database connections", () => {
  const project = withMaxConnections(projectB, 10);
  let run: MetricsRun;
  let totals: MetricsSnapshot;
  let snapshots: readonly MetricsSnapshot[];
  beforeAll(() => {
    run = runScenario({ project, workloadId: "lunch-rush", seed: 42 });
    ({ totals, snapshots } = run);
  }, RUN_TIMEOUT_MS);

  // Fails if a failed delivery is counted in asyncFailed without its cause,
  // or if the totals stop adding up the windows' causes.
  it("adds up each component's failed deliveries by cause to asyncFailed", () => {
    for (const snapshot of [...snapshots, totals]) {
      for (const [id, m] of Object.entries(snapshot.components)) {
        const byCause = Object.values(m.asyncFailures).reduce(
          (n, failed) => n + failed,
          0,
        );
        expect(byCause, `${id} at ${String(snapshot.endMs)} ms`).toBe(
          m.asyncFailed,
        );
      }
    }
    expect(componentIn(totals, "orders-queue").asyncFailed).toBeGreaterThan(0);
  });

  // Fails if the engine stops passing the failure that ended a delivery to
  // the observer, or passes the failure of the queue's own step instead of
  // the call that was refused.
  it("traces every failed delivery to orders-db's refusals", () => {
    expect(componentIn(totals, "orders-queue").asyncFailures).toEqual({
      "orders-db: too-many-connections": 90,
    });
  });

  // Fails if the failed-deliveries finding's attempts don't add up, or
  // quote other counts than the totals: attempts (fn-writer's arrivals) =
  // delivered + failed + being delivered, and messages accepted = delivered
  // + waiting + being delivered (findings.md §1.8.6). "Being delivered" is
  // the consumers' slots held, so the second sum is a check, not a
  // remainder.
  it("reconciles the failed-deliveries finding's attempts with the totals", () => {
    const soFar = { project, workloadId: "lunch-rush", snapshots };
    const findings = findRun(soFar, createDetectors()).findings;
    const finding = findings
      .map((n) => n.finding)
      .find((f) => f.key.kind === FAILED_DELIVERIES);
    const quoted = (what: string): number => evidenceValue(finding, what);
    const queue = componentIn(totals, "orders-queue");
    const delivered = quoted("orders-queue: deliveries (asyncSucceeded)");
    const failed = quoted("orders-queue: failed deliveries (asyncFailed)");
    const beingDelivered = quoted("orders-queue: being delivered");
    const waiting = quoted("orders-queue: queueDepth");
    expect([delivered, failed, waiting]).toEqual([
      queue.asyncSucceeded,
      queue.asyncFailed,
      queue.queueDepth,
    ]);
    expect(delivered + failed + beingDelivered).toBe(
      componentIn(totals, "fn-writer").arrivals,
    );
    expect(delivered + waiting + beingDelivered).toBe(queue.completed);
    expect(failed).toBe(90);
  });

  // Fails if the Components table stops listing a component's failed
  // deliveries by cause after its "async failed" count.
  it("prints orders-queue's failed deliveries by cause in the report", () => {
    const workload = project.workloads.find((w) => w.id === "lunch-rush");
    if (workload === undefined) throw new Error("template-b has no lunch-rush");
    expect(formatReport({ project, workload, run, registry })).toContain(
      "async failed=90 (orders-db: too-many-connections 90)",
    );
  });

  // Fails if any part of the report reads a component's ID where it should
  // read its name: a finding or fix, a table cell, a failure cause, or a
  // per-second column header. The template's names equal its IDs, so the
  // names here are made to differ. A fix's evidence may still cite the
  // template's own component ("Template B's orders-db"): that's prose about
  // the run that proved the fix, not a component of this project.
  it("shows every component by its name, never by its ID", () => {
    const workload = project.workloads.find((w) => w.id === "lunch-rush");
    if (workload === undefined) throw new Error("template-b has no lunch-rush");
    const { components } = project.architecture;
    const renamed: Project = {
      ...project,
      architecture: {
        ...project.architecture,
        components: components.map((c) => ({ ...c, name: c.id.toUpperCase() })),
      },
    };
    const report = formatReport({ project: renamed, workload, run, registry });
    const shownAt = (id: string) =>
      new RegExp(`(^|[^\\w-])(?<!Template B's )${id}($|[^\\w-])`);
    const shown = components
      .map((c) => c.id)
      .filter((id) => shownAt(id).test(report));
    expect(shown).toEqual([]);
    expect(report).toContain("ORDERS-DB: too-many-connections");
  });
});

/** The value of the finding's evidence whose description starts with `what`. */
function evidenceValue(finding: Finding | undefined, what: string): number {
  const found = finding?.evidence.find((e) => e.what.startsWith(what));
  if (found === undefined) throw new Error(`No evidence for "${what}"`);
  return found.value;
}
