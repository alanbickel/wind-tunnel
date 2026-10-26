import { createAwsComponentRegistry } from "../../../domain/components/aws";
import { simulateWithMetrics } from "../../../domain/metrics/metrics-collector";
import type { Project } from "../../../domain/model/project";
import { loadProject } from "../../persistence/load-project";

/** The AWS types, for the template helpers and the tests that use them. */
export const registry = createAwsComponentRegistry();

/**
 * The time a `beforeAll` gives its whole-template runs. A run that takes 4 s
 * alone can take several times that in a busy full run (#15). Use it in
 * `beforeAll`; CONTRIBUTING's Tests section says why.
 */
export const RUN_TIMEOUT_MS = 60_000;

/** Loads a template's JSON, throwing with the issues if it doesn't load. */
export function loadTemplate(template: unknown): Project {
  const loaded = loadProject(template, registry);
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
  return loaded.record.project;
}

/** Loads a template and runs its first workload to the end. */
export function runTemplate(template: unknown) {
  const project = loadTemplate(template);
  const workloadId = project.workloads[0]?.id ?? "";
  const run = simulateWithMetrics({ project, workloadId, registry });
  return { project, workloadId, ...run };
}
