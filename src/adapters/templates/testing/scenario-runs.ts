import { expect } from "vitest";
import { createAwsComponentRegistry } from "../../../domain/components/aws";
import type { MetricsSnapshot } from "../../../domain/metrics/metrics-collector";
import { simulateWithMetrics } from "../../../domain/metrics/metrics-collector";
import { limitExhausted } from "../../../domain/metrics/limit-exhausted";
import { componentIn } from "../../../domain/metrics/testing/snapshot-lookups";
import type { Project } from "../../../domain/model/project";
import templateA from "../template-a.json";
import templateB from "../template-b.json";
import { loadTemplate } from "./run-template";

// Shared by the scenario tests in `../scenarios/`, which check that each
// template teaches its lesson under each workload. Each workload has its own
// file, and the long rush one per template, so the runs spread across test
// workers instead of queueing in one: the long rush takes most of the time.

const registry = createAwsComponentRegistry();

/** Each scenario runs on these seeds, so a lesson can't rest on one lucky run. */
export const SEEDS = [42, 7, 2026];

export const projectA = loadTemplate(templateA);
export const projectB = loadTemplate(templateB);

/** A stretch of a run, in whole seconds from its start. */
export interface Phase {
  readonly fromSec: number;
  readonly toSec: number;
}

/** A template's workload, run on one seed. */
export interface ScenarioInput {
  readonly project: Project;
  readonly workloadId: string;
  readonly seed: number;
}

/** Runs the workload to the end with every workload's seed set to `seed`. */
export function runScenario({ project, workloadId, seed }: ScenarioInput) {
  const workloads = project.workloads.map((w) => ({ ...w, seed }));
  return simulateWithMetrics({
    project: { ...project, workloads },
    workloadId,
    registry,
  });
}

/** The snapshots of the seconds that lie wholly inside `phase`. */
export function during(
  snapshots: readonly MetricsSnapshot[],
  phase: Phase,
): MetricsSnapshot[] {
  return snapshots.filter(
    (s) => s.startMs >= phase.fromSec * 1000 && s.endMs <= phase.toSec * 1000,
  );
}

/** Requests that failed in the snapshot, over every workflow. */
export function failed(snapshot: MetricsSnapshot): number {
  return Object.values(snapshot.workflows).reduce((n, w) => n + w.failed, 0);
}

/** Every limit a component ran out of, as "component limit". */
export function exhaustedLimits(snapshot: MetricsSnapshot): string[] {
  return Object.entries(snapshot.components).flatMap(([id, c]) =>
    c.limits.filter(limitExhausted).map((l) => `${id} ${l.name}`),
  );
}

/** Messages waiting in orders-queue at the end of the second. */
export function backlog(snapshot: MetricsSnapshot): number {
  return componentIn(snapshot, "orders-queue").queueDepth;
}

/** Checks that no workflow failed a request and no component rejected one. */
export function expectEveryRequestServed(totals: MetricsSnapshot): void {
  for (const [id, w] of Object.entries(totals.workflows)) {
    expect({ id, failed: w.failed }).toEqual({ id, failed: 0 });
  }
  for (const [id, c] of Object.entries(totals.components)) {
    expect({ id, rejected: c.rejected }).toEqual({ id, rejected: 0 });
  }
}
