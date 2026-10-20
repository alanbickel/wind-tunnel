import type {
  ComponentMetrics,
  LimitUse,
  MetricsSnapshot,
  WorkflowMetrics,
} from "../metrics-collector";

/**
 * Lookups for tests: a missing entry throws instead of returning `undefined`,
 * so assertions don't need `?.` at every step.
 */
export function workflowIn(
  snapshot: MetricsSnapshot,
  workflowId: string,
): WorkflowMetrics {
  const metrics = snapshot.workflows[workflowId];
  if (metrics === undefined) throw new Error(`No metrics for ${workflowId}`);
  return metrics;
}

export function componentIn(
  snapshot: MetricsSnapshot,
  componentId: string,
): ComponentMetrics {
  const metrics = snapshot.components[componentId];
  if (metrics === undefined) throw new Error(`No metrics for ${componentId}`);
  return metrics;
}

export function limitIn(metrics: ComponentMetrics, name: string): LimitUse {
  const limit = metrics.limits.find((l) => l.name === name);
  if (limit === undefined) throw new Error(`No limit named ${name}`);
  return limit;
}
