import type {
  Edge,
  Project,
  Step,
  Workflow,
} from "../../../../domain/model/project";

/**
 * A queue that workflows enqueue work into, and the longest a synchronous
 * caller of those workflows would wait: the timeout on their entry edge.
 */
export interface AsyncTarget {
  readonly queueId: string;
  /** The entry edge with the shortest timeout among the workflows. */
  readonly entryEdge: Edge;
  /** The workflows that enqueue into the queue, in project order. */
  readonly workflowIds: readonly string[];
}

/**
 * Every queue a workflow enqueues into, in the order first found. A
 * workflow whose entry point calls nothing has no entry edge, so its queues
 * have no timeout to compare with.
 */
export function asyncTargets(project: Project): AsyncTarget[] {
  const targets = new Map<string, AsyncTarget>();
  for (const workflow of project.workflows) {
    const entryEdge = entryEdgeOf(project, workflow);
    if (entryEdge === undefined) continue;
    for (const queueId of new Set(enqueuedIn(workflow.root))) {
      targets.set(
        queueId,
        merged(targets.get(queueId), {
          queueId,
          entryEdge,
          workflowIds: [workflow.id],
        }),
      );
    }
  }
  return [...targets.values()];
}

/**
 * The edge from the workflow's entry point to what it calls, with the
 * shortest timeout if it calls several: how long the user's request can
 * wait for an answer, as the project sets it (findings.md §2.1).
 */
function entryEdgeOf(project: Project, workflow: Workflow): Edge | undefined {
  const { root } = workflow;
  const callees = new Set((root.calls ?? []).map((c) => c.componentId));
  return project.architecture.edges
    .filter((e) => e.from === root.componentId && callees.has(e.to))
    .reduce<Edge | undefined>(shorterTimeout, undefined);
}

function shorterTimeout(a: Edge | undefined, b: Edge): Edge {
  return a === undefined || b.timeoutMs < a.timeoutMs ? b : a;
}

/** The components the step and its calls enqueue into, async work included. */
function enqueuedIn(step: Step): string[] {
  const nested = [
    ...(step.calls ?? []),
    ...(step.async === undefined ? [] : [step.async]),
  ];
  const own = step.action === "enqueue" ? [step.componentId] : [];
  return [...own, ...nested.flatMap(enqueuedIn)];
}

function merged(
  existing: AsyncTarget | undefined,
  added: AsyncTarget,
): AsyncTarget {
  if (existing === undefined) return added;
  return {
    queueId: existing.queueId,
    entryEdge: shorterTimeout(existing.entryEdge, added.entryEdge),
    workflowIds: [...existing.workflowIds, ...added.workflowIds],
  };
}
