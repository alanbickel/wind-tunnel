import { createAwsComponentRegistry } from "../../../domain/components/aws";
import { simulateWithMetrics } from "../../../domain/metrics/metrics-collector";
import type { Project } from "../../../domain/model/project";
import { loadProject } from "../../persistence/load-project";

const registry = createAwsComponentRegistry();

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
  return { project, ...simulateWithMetrics({ project, workloadId, registry }) };
}
