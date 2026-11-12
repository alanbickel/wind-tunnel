import type { Workload } from "../../domain/model/project";

/** The workloads in list order, and the one that's going. */
export interface WorkloadAfterRemovalInput {
  readonly workloads: readonly Workload[];
  readonly removedId: string;
}

/**
 * The workload the project bar picks once one is removed (UX design §2.7
 * step 11): the one after it in the list, or the one before if it was the
 * last. Undefined if it was the only one, or isn't in the list.
 */
export function workloadAfterRemoval({
  workloads,
  removedId,
}: WorkloadAfterRemovalInput): Workload | undefined {
  const index = workloads.findIndex((w) => w.id === removedId);
  if (index < 0) return undefined;
  return workloads[index + 1] ?? workloads[index - 1];
}
