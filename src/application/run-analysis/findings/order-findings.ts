import { lookup } from "../../../domain/shared/kind-handlers";
import type { Finding, FindingKey, Severity } from "./finding";
import { compareKeys, sameKey } from "./finding-key";

/** A finding, with the findings it follows from beneath it. */
export interface FindingNode {
  /**
   * The finding, less the fixes and Learn more that a finding above it
   * already shows: a failure and its cause often share a fix.
   */
  readonly finding: Finding;
  /** The findings its `causedBy` names, ordered as the top level is. */
  readonly causes: readonly FindingNode[];
}

/**
 * The findings as a tree, in a fully determined order (findings.md §3.3). A
 * finding cited in another's `causedBy` shows beneath it, not at the top.
 * A `causedBy` key that no finding has is ignored, and a cycle of causes is
 * broken where it's first met, so every finding shows at least once.
 */
export function orderFindings(findings: readonly Finding[]): FindingNode[] {
  const sorted = [...findings].sort(compareFindings);
  const context: TreeContext = { sorted, shown: [], above: [] };
  const top = sorted
    .filter((f) => !isCited(f, findings))
    .map((f) => nodeOf(f, context));
  // Findings only reachable through a cycle of causes.
  for (const finding of sorted) {
    if (!includesKey(context.shown, finding.key)) {
      top.push(nodeOf(finding, context));
    }
  }
  return top;
}

/** The findings, and which have been shown, while the tree is built. */
interface TreeContext {
  /** Every finding, in `compareFindings` order. */
  readonly sorted: readonly Finding[];
  readonly shown: FindingKey[];
  /**
   * The findings on the way down from the top: a cycle stops at them, and
   * their fixes aren't repeated beneath them.
   */
  readonly above: readonly Finding[];
}

function nodeOf(finding: Finding, context: TreeContext): FindingNode {
  context.shown.push(finding.key);
  const above = [...context.above, finding];
  const causes = context.sorted.filter(
    (c) =>
      includesKey(finding.causedBy, c.key) &&
      !includesKey(
        above.map((a) => a.key),
        c.key,
      ),
  );
  return {
    finding: withoutRepeats(finding, context.above),
    causes: causes.map((c) => nodeOf(c, { ...context, above })),
  };
}

function isCited(finding: Finding, findings: readonly Finding[]): boolean {
  return findings.some((f) => includesKey(f.causedBy, finding.key));
}

function includesKey(keys: readonly FindingKey[], key: FindingKey): boolean {
  return keys.some((k) => sameKey(k, key));
}

/**
 * The finding without the fixes, or the Learn more, that a finding above it
 * shows. A fix is the same when it's the same catalog entry: two limits'
 * advice share one `Fix` object (`catalog/`).
 */
function withoutRepeats(finding: Finding, above: readonly Finding[]): Finding {
  if (above.length === 0) return finding;
  const shownFixes = new Set(above.flatMap((a) => a.fixes));
  const learnMoreShown = above.some((a) => a.learnMore === finding.learnMore);
  return {
    ...finding,
    fixes: finding.fixes.filter((fix) => !shownFixes.has(fix)),
    learnMore: learnMoreShown ? undefined : finding.learnMore,
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
 * the key, field by field, so the order is the same on every run.
 */
export function compareFindings(a: Finding, b: Finding): number {
  return (
    lookup(SEVERITY_RANK, a.severity) - lookup(SEVERITY_RANK, b.severity) ||
    (b.affected ?? -1) - (a.affected ?? -1) ||
    a.window.fromMs - b.window.fromMs ||
    compareKeys(a.key, b.key)
  );
}
