import type { Edge, Project, Step, Workload } from "./project";

/** A problem found in a project, located by a path into its data. */
export interface ValidationIssue {
  /** Where the problem is, e.g. `["workflows", 0, "root", "calls", 1]`. */
  readonly path: IssuePath;
  readonly message: string;
}

/** Keys and array indexes from the root of a project to one value in it. */
export type IssuePath = readonly (string | number)[];

/** Anything with an ID that must be unique among its siblings. */
interface Identified {
  readonly id: string;
}

/**
 * Checks the rules that span a whole project and that a schema can't express
 * (MVP design §6, "Load-time checks"): unique IDs, references to things that
 * exist, calls that follow edges, and well-formed workloads. Field shapes and
 * number ranges are checked earlier, by the document schema.
 *
 * Returns every issue found rather than stopping at the first, so a user can
 * fix them all at once. An empty list means the project is valid.
 */
export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report = (path: IssuePath, message: string) => {
    issues.push({ path, message });
  };

  const { components, edges } = project.architecture;
  checkUniqueIds(
    components,
    ["architecture", "components"],
    "component",
    report,
  );
  checkUniqueIds(edges, ["architecture", "edges"], "edge", report);
  checkUniqueIds(project.workflows, ["workflows"], "workflow", report);
  checkUniqueIds(project.workloads, ["workloads"], "workload", report);

  const componentIds = new Set(components.map((c) => c.id));
  const edgeTargets = checkEdges(edges, componentIds, report);

  project.workflows.forEach((workflow, index) => {
    checkStep(workflow.root, ["workflows", index, "root"], undefined, {
      componentIds,
      edgeTargets,
      report,
    });
  });

  const workflowIds = new Set(project.workflows.map((w) => w.id));
  project.workloads.forEach((workload, index) => {
    checkWorkload(workload, ["workloads", index], workflowIds, report);
  });

  return issues;
}

type Report = (path: IssuePath, message: string) => void;

function checkUniqueIds(
  items: readonly Identified[],
  path: IssuePath,
  kind: string,
  report: Report,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      report([...path, index, "id"], `Duplicate ${kind} ID "${item.id}".`);
    }
    seen.add(item.id);
  });
}

/** Checks edge endpoints and returns, for each component, where it can call. */
function checkEdges(
  edges: readonly Edge[],
  componentIds: ReadonlySet<string>,
  report: Report,
): Map<string, Set<string>> {
  const targets = new Map<string, Set<string>>();
  edges.forEach((edge, index) => {
    const path = ["architecture", "edges", index];
    for (const end of ["from", "to"] as const) {
      if (!componentIds.has(edge[end])) {
        report(
          [...path, end],
          `Edge "${edge.id}" refers to unknown component "${edge[end]}".`,
        );
      }
    }
    if (edge.from === edge.to) {
      report(path, `Edge "${edge.id}" connects "${edge.from}" to itself.`);
    }
    const fromTargets = targets.get(edge.from) ?? new Set<string>();
    if (fromTargets.has(edge.to)) {
      // Two edges between the same pair would make it ambiguous which one's
      // latency, timeout, and retries apply to a call.
      report(
        path,
        `Edge "${edge.id}" duplicates another edge from "${edge.from}" to "${edge.to}".`,
      );
    }
    fromTargets.add(edge.to);
    targets.set(edge.from, fromTargets);
  });
  return targets;
}

interface StepContext {
  readonly componentIds: ReadonlySet<string>;
  readonly edgeTargets: ReadonlyMap<string, ReadonlySet<string>>;
  readonly report: Report;
}

function checkStep(
  step: Step,
  path: IssuePath,
  callerId: string | undefined,
  context: StepContext,
): void {
  const { componentIds, edgeTargets, report } = context;

  if (!componentIds.has(step.componentId)) {
    report(
      [...path, "componentId"],
      `Step refers to unknown component "${step.componentId}".`,
    );
  } else if (
    callerId !== undefined &&
    edgeTargets.get(callerId)?.has(step.componentId) !== true
  ) {
    report(
      path,
      `No edge from "${callerId}" to "${step.componentId}"; every call must follow an edge.`,
    );
  }

  step.calls?.forEach((child, index) => {
    checkStep(child, [...path, "calls", index], step.componentId, context);
  });

  if (step.async !== undefined) {
    if (step.action !== "enqueue") {
      report(
        [...path, "async"],
        `Only "enqueue" steps can have async work; this step is "${step.action}".`,
      );
    }
    // The consumer is called by the queue, so that call needs an edge too.
    checkStep(step.async, [...path, "async"], step.componentId, context);
  }
}

function checkWorkload(
  workload: Workload,
  path: IssuePath,
  workflowIds: ReadonlySet<string>,
  report: Report,
): void {
  if (workload.mix.length === 0) {
    report([...path, "mix"], "The mix needs at least one workflow.");
  }
  const mixed = new Set<string>();
  workload.mix.forEach((entry, index) => {
    const entryPath = [...path, "mix", index];
    if (!workflowIds.has(entry.workflowId)) {
      report(
        [...entryPath, "workflowId"],
        `Mix refers to unknown workflow "${entry.workflowId}".`,
      );
    }
    if (mixed.has(entry.workflowId)) {
      report(
        [...entryPath, "workflowId"],
        `Workflow "${entry.workflowId}" appears in the mix more than once.`,
      );
    }
    mixed.add(entry.workflowId);
    if (!(entry.weight > 0)) {
      report([...entryPath, "weight"], "Mix weights must be positive.");
    }
  });

  if (workload.profile.length === 0) {
    report([...path, "profile"], "The profile needs at least one point.");
  }
  workload.profile.forEach((point, index) => {
    const pointPath = [...path, "profile", index];
    const previous = workload.profile[index - 1];
    if (previous !== undefined && !(point.atSec > previous.atSec)) {
      report(
        [...pointPath, "atSec"],
        `Profile times must increase; ${String(point.atSec)} s comes after ${String(previous.atSec)} s.`,
      );
    }
    if (!(point.requestsPerSec >= 0)) {
      report(
        [...pointPath, "requestsPerSec"],
        "Request rates can't be negative.",
      );
    }
  });
}
