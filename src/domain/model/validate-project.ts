import type { Edge, Project, Step, Workflow, Workload } from "./project";

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
  const report: Report = (path, message) => {
    issues.push({ path, message });
  };

  checkAllUniqueIds(project, report);
  const { components, edges } = project.architecture;
  const componentIds = new Set(components.map((c) => c.id));
  const edgeTargets = checkEdges(edges, { componentIds, report });
  checkWorkflows(project.workflows, { componentIds, edgeTargets, report });
  const workflowIds = new Set(project.workflows.map((w) => w.id));
  checkWorkloads(project.workloads, { workflowIds, report });

  return issues;
}

type Report = (path: IssuePath, message: string) => void;

/** For each component, the components it has an edge to. */
type EdgeTargets = ReadonlyMap<string, ReadonlySet<string>>;

/** One list whose items' IDs must be unique, and what to call an item. */
interface UniqueIdList {
  readonly items: readonly Identified[];
  readonly path: IssuePath;
  readonly kind: string;
}

function checkAllUniqueIds(project: Project, report: Report): void {
  const { components, edges } = project.architecture;
  const lists: UniqueIdList[] = [
    {
      items: components,
      path: ["architecture", "components"],
      kind: "component",
    },
    { items: edges, path: ["architecture", "edges"], kind: "edge" },
    { items: project.workflows, path: ["workflows"], kind: "workflow" },
    { items: project.workloads, path: ["workloads"], kind: "workload" },
  ];
  for (const list of lists) checkUniqueIds(list, report);
}

function checkUniqueIds(
  { items, path, kind }: UniqueIdList,
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

interface EdgeContext {
  readonly componentIds: ReadonlySet<string>;
  readonly report: Report;
}

/** An edge and where it is in the project. */
interface EdgeAt {
  readonly edge: Edge;
  readonly path: IssuePath;
}

/** Where each component can already call, to spot a second edge to the same place. */
interface TargetContext {
  readonly targets: Map<string, Set<string>>;
  readonly report: Report;
}

/** Checks edge endpoints and returns, for each component, where it can call. */
function checkEdges(edges: readonly Edge[], context: EdgeContext): EdgeTargets {
  const targets = new Map<string, Set<string>>();
  edges.forEach((edge, index) => {
    const at: EdgeAt = { edge, path: ["architecture", "edges", index] };
    checkEndpoints(at, context);
    addTarget(at, { targets, report: context.report });
  });
  return targets;
}

function checkEndpoints({ edge, path }: EdgeAt, context: EdgeContext): void {
  const { componentIds, report } = context;
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
}

function addTarget({ edge, path }: EdgeAt, context: TargetContext): void {
  const { targets, report } = context;
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
}

interface StepContext {
  readonly componentIds: ReadonlySet<string>;
  readonly edgeTargets: EdgeTargets;
  readonly report: Report;
}

/** A step, where it is in the project, and the component that calls it. */
interface StepAt {
  readonly step: Step;
  readonly path: IssuePath;
  /** `undefined` for a workflow's root, which the user calls. */
  readonly callerId: string | undefined;
}

function checkWorkflows(
  workflows: readonly Workflow[],
  context: StepContext,
): void {
  workflows.forEach((workflow, index) => {
    const path = ["workflows", index, "root"];
    checkStep({ step: workflow.root, path, callerId: undefined }, context);
  });
}

function checkStep(at: StepAt, context: StepContext): void {
  const { step, path } = at;
  checkTarget(at, context);
  step.calls?.forEach((child, index) => {
    const childPath = [...path, "calls", index];
    checkStep(
      { step: child, path: childPath, callerId: step.componentId },
      context,
    );
  });
  checkAsync(at, context);
}

/** The step's component exists, and its caller has an edge to it. */
function checkTarget(at: StepAt, context: StepContext): void {
  const { step, path, callerId } = at;
  const { componentIds, edgeTargets, report } = context;
  if (!componentIds.has(step.componentId)) {
    report(
      [...path, "componentId"],
      `Step refers to unknown component "${step.componentId}".`,
    );
    return;
  }
  if (callerId === undefined) return;
  if (edgeTargets.get(callerId)?.has(step.componentId) === true) return;
  report(
    path,
    `No edge from "${callerId}" to "${step.componentId}"; every call must follow an edge.`,
  );
}

function checkAsync({ step, path }: StepAt, context: StepContext): void {
  if (step.async === undefined) return;
  const asyncPath = [...path, "async"];
  if (step.action !== "enqueue") {
    context.report(
      asyncPath,
      `Only "enqueue" steps can have async work; this step is "${step.action}".`,
    );
  }
  // The consumer is called by the queue, so that call needs an edge too.
  checkStep(
    { step: step.async, path: asyncPath, callerId: step.componentId },
    context,
  );
}

interface WorkloadContext {
  readonly workflowIds: ReadonlySet<string>;
  readonly report: Report;
}

/** A workload and where it is in the project. */
interface WorkloadAt {
  readonly workload: Workload;
  readonly path: IssuePath;
}

function checkWorkloads(
  workloads: readonly Workload[],
  context: WorkloadContext,
): void {
  workloads.forEach((workload, index) => {
    const at: WorkloadAt = { workload, path: ["workloads", index] };
    checkMix(at, context);
    checkProfile(at, context.report);
  });
}

function checkMix(
  { workload, path }: WorkloadAt,
  context: WorkloadContext,
): void {
  const { workflowIds, report } = context;
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
}

function checkProfile({ workload, path }: WorkloadAt, report: Report): void {
  if (workload.profile.length === 0) {
    report([...path, "profile"], "The profile needs at least one point.");
  }
  workload.profile.forEach((point, index) => {
    const pointPath = [...path, "profile", index];
    const previous = workload.profile[index - 1];
    if (previous !== undefined && !(point.atMs > previous.atMs)) {
      report(
        [...pointPath, "atMs"],
        `Profile times must increase; ${seconds(point.atMs)} comes after ${seconds(previous.atMs)}.`,
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

/** A time for a message, in the seconds users enter in the document. */
function seconds(timeMs: number): string {
  return `${String(timeMs / 1000)} s`;
}
