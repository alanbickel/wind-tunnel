import { lookup } from "../../../domain/shared/kind-handlers";
import type { Finding, Severity } from "./finding";

/** A finding, with the findings it follows from beneath it. */
export interface FindingNode {
  readonly finding: Finding;
  /** The findings its `causedBy` names, ordered as the top level is. */
  readonly causes: readonly FindingNode[];
}

/**
 * The findings as a tree, in a fully determined order (findings.md §3.3). A
 * finding cited in another's `causedBy` shows beneath it, not at the top.
 * A `causedBy` ID that no finding has is ignored, and a cycle of causes is
 * broken where it's first met, so every finding shows at least once.
 */
export function orderFindings(findings: readonly Finding[]): FindingNode[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const cited = new Set(findings.flatMap((f) => f.causedBy));
  const sorted = [...findings].sort(compareFindings);
  const shown = new Set<string>();
  const uncited = sorted.filter((f) => !cited.has(f.id));
  const top = uncited.map((f) => nodeOf(f, { byId, shown, path: new Set() }));
  // Findings only reachable through a cycle of causes.
  for (const finding of sorted) {
    if (!shown.has(finding.id)) {
      top.push(nodeOf(finding, { byId, shown, path: new Set() }));
    }
  }
  return top;
}

/** The findings by ID, and which have been shown, while the tree is built. */
interface TreeContext {
  readonly byId: ReadonlyMap<string, Finding>;
  readonly shown: Set<string>;
  /** IDs on the way down from the top, so a cycle stops. */
  readonly path: ReadonlySet<string>;
}

function nodeOf(finding: Finding, context: TreeContext): FindingNode {
  context.shown.add(finding.id);
  const path = new Set([...context.path, finding.id]);
  const causes = finding.causedBy
    .flatMap((id) => {
      const cause = context.byId.get(id);
      return cause === undefined || path.has(id) ? [] : [cause];
    })
    .sort(compareFindings);
  return {
    finding,
    causes: causes.map((c) => nodeOf(c, { ...context, path })),
  };
}

/** Most severe first. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  failure: 0,
  warning: 1,
  note: 2,
};

/**
 * By severity; then `affected`, largest first, with uncounted findings
 * after the counted ones; then the window's start, earliest first; then
 * `id`, so the order is the same on every run.
 */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    lookup(SEVERITY_RANK, a.severity) - lookup(SEVERITY_RANK, b.severity) ||
    (b.affected ?? -1) - (a.affected ?? -1) ||
    a.window.fromMs - b.window.fromMs ||
    compareIds(a.id, b.id)
  );
}

/** By code unit, not locale, so the order doesn't depend on the machine. */
function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
