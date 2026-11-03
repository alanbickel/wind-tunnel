import { edgeSettingsSchema } from "./edge-settings";
import type { Edge, Project } from "./project";
import type { IssuePath, ValidationIssue } from "./validation-issue";
import { issuesFromZod } from "./zod-issues";

/** Anything with an ID that must be unique among its siblings. */
interface Identified {
  readonly id: string;
}

/**
 * Checks the architecture's rules that don't depend on component types and
 * that a schema can't express (MVP design §6, "Load-time checks"): unique
 * IDs, and edges whose ends exist, that don't loop to themselves, and that
 * don't duplicate another edge. It checks each edge's settings against
 * `edgeSettingsSchema` too, so an edited edge saves only if the project
 * could open again. The document schema checks the rest of the shapes and
 * ranges when a project loads.
 *
 * Workflow and workload IDs are checked here too, though they aren't the
 * architecture: every reference to a workflow is by ID, so the run checks
 * (`findRunIssues`) need them unique.
 *
 * Returns every issue found rather than stopping at the first, so a user can
 * fix them all at once. An empty list means these rules hold.
 */
export function validateArchitecture(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const report: Report = (path, message) => {
    issues.push({ path, message });
  };

  checkAllUniqueIds(project, report);
  const { components, edges } = project.architecture;
  const componentIds = new Set(components.map((c) => c.id));
  checkEdges(edges, { componentIds, report });

  return issues;
}

type Report = (path: IssuePath, message: string) => void;

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
interface EdgeInput {
  readonly edge: Edge;
  readonly path: IssuePath;
}

/** Where each component can already call, to spot a second edge to the same place. */
interface TargetContext {
  readonly targets: Map<string, Set<string>>;
  readonly report: Report;
}

function checkEdges(edges: readonly Edge[], context: EdgeContext): void {
  const targets = new Map<string, Set<string>>();
  edges.forEach((edge, index) => {
    const at: EdgeInput = { edge, path: ["architecture", "edges", index] };
    checkEndpoints(at, context);
    checkSettings(at, context.report);
    checkNotDuplicate(at, { targets, report: context.report });
  });
}

function checkEndpoints({ edge, path }: EdgeInput, context: EdgeContext): void {
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

/** The edge's latency, timeout, and retry policy are in range. */
function checkSettings({ edge, path }: EdgeInput, report: Report): void {
  const { latencyMs, timeoutMs, retry } = edge;
  const parsed = edgeSettingsSchema.safeParse({ latencyMs, timeoutMs, retry });
  if (parsed.success) return;
  for (const issue of issuesFromZod(parsed.error)) {
    report([...path, ...issue.path], `Edge "${edge.id}": ${issue.message}`);
  }
}

function checkNotDuplicate(
  { edge, path }: EdgeInput,
  context: TargetContext,
): void {
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
