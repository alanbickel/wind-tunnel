import type {
  ComponentMetrics,
  LimitUse,
  RateLimitUse,
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

export function rateLimitIn(
  metrics: ComponentMetrics,
  name: string,
): RateLimitUse {
  const limit = limitIn(metrics, name);
  if (limit.kind !== "rate") throw new Error(`${name} isn't a rate limit`);
  return limit;
}
