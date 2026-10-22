import { createAwsComponentRegistry } from "../../../domain/components/aws";
import type { ComponentRejectedEvent } from "../../../domain/engine/simulation-events";
import { limitExhausted } from "../../../domain/metrics/limit-exhausted";
import {
  simulateWithMetrics,
  type MetricsRun,
  type MetricsSnapshot,
} from "../../../domain/metrics/metrics-collector";
import type { LimitUse } from "../../../domain/metrics/metrics-snapshot";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";

const registry = createAwsComponentRegistry();

/** A run, with every rejection the engine reported during it. */
export interface RunWithRejections extends MetricsRun {
  /** Retried attempts included, not only the ones that failed a request. */
  readonly rejections: readonly ComponentRejectedEvent[];
}

/** A project's workload to run. */
export interface RejectionRunInput {
  readonly project: Project;
  readonly workloadId: string;
}

/** Runs the workload to the end, recording each component's rejections. */
export function runRecordingRejections({
  project,
  workloadId,
}: RejectionRunInput): RunWithRejections {
  const rejections: ComponentRejectedEvent[] = [];
  const run = simulateWithMetrics({
    project,
    workloadId,
    registry,
    observer: (event) => {
      if (event.kind === "component-rejected") rejections.push(event);
    },
  });
  return { ...run, rejections };
}

/**
 * The rejections that their component's limit declarations don't explain,
 * one line per component, reason, and second. A rejection is explained when
 * one of its component's limits declares that it refuses with the
 * rejection's reason and is exhausted (`limitExhausted`) in the second the
 * rejection happened. The failed-requests finding relies on this to name
 * the limit behind a failure (ADR-0015).
 *
 * This is stricter than the contract, which also accepts a listed reason
 * that no limit declares (ADR-0016). Every reason the AWS types list comes
 * from a limit, so here every rejection must.
 */
export function unexplainedRejections(run: RunWithRejections): string[] {
  const lines = run.rejections
    .filter((r) => !explained(r, run.snapshots))
    .map((r) => rejectionLine(r, run.snapshots));
  return [...new Set(lines)];
}

function explained(
  rejection: ComponentRejectedEvent,
  snapshots: readonly MetricsSnapshot[],
): boolean {
  return limitsAt(rejection, snapshots).some(
    (limit) => refusesWith(limit, rejection.reason) && limitExhausted(limit),
  );
}

/** The component's limits in the second the rejection happened. */
function limitsAt(
  { componentId, timeMs }: ComponentRejectedEvent,
  snapshots: readonly MetricsSnapshot[],
): readonly LimitUse[] {
  // Windows are [startMs, endMs), except that the last includes its end.
  const second = snapshots.findLast((s) => s.startMs <= timeMs);
  if (second === undefined) {
    throw new Error(`No snapshot covers ${String(timeMs)} ms`);
  }
  return componentIn(second, componentId).limits;
}

function refusesWith(limit: LimitUse, reason: string): boolean {
  return limit.whenFull.kind === "refuse" && limit.whenFull.reason === reason;
}

function rejectionLine(
  rejection: ComponentRejectedEvent,
  snapshots: readonly MetricsSnapshot[],
): string {
  const { componentId, reason, timeMs } = rejection;
  const limits = limitsAt(rejection, snapshots)
    .map((l) => `${l.name} ${String(l.peak)}/${String(l.limit)}`)
    .join(", ");
  return `${componentId}: ${reason} in the second from ${String(Math.floor(timeMs / 1000))} s; limits at peak: ${limits || "none"}`;
}

/**
 * The project with orders-read's `readUnitsPerSec` replaced: findings.md
 * §1.7's variant of Template B at 1,500, whose long rush drains the read
 * bucket and throttles reads. Built in tests only; the template keeps its
 * setting.
 */
export function withReadUnitsPerSec(
  project: Project,
  readUnitsPerSec: number,
): Project {
  return withConfig(project, {
    id: "orders-read",
    config: { readUnitsPerSec },
  });
}

/**
 * The project with orders-queue's `consumerMaxConcurrency` replaced: with
 * fewer consumers, Template B's lunch-rush backlog outlasts the run. Built
 * in tests only; the template keeps its setting.
 */
export function withConsumerMaxConcurrency(
  project: Project,
  consumerMaxConcurrency: number,
): Project {
  return withConfig(project, {
    id: "orders-queue",
    config: { consumerMaxConcurrency },
  });
}

/**
 * The project with orders-db's `maxConnections` replaced: findings.md §1.8's
 * variant of Template B at 10, whose lunch rush refuses some of fn-writer's
 * calls, so those deliveries fail and are redelivered. Built in tests only;
 * the template keeps its setting.
 */
export function withMaxConnections(
  project: Project,
  maxConnections: number,
): Project {
  return withConfig(project, {
    id: "orders-db",
    config: { maxConnections },
  });
}

/** A component, and the settings of its config to replace. */
interface ConfigChange {
  readonly id: string;
  readonly config: Readonly<Record<string, unknown>>;
}

function withConfig(project: Project, { id, config }: ConfigChange): Project {
  const components = project.architecture.components.map((c) =>
    c.id === id ? { ...c, config: { ...c.config, ...config } } : c,
  );
  return { ...project, architecture: { ...project.architecture, components } };
}
