import type { RunFindings } from "./find-run";
import type { Fix } from "./finding";
import type { FindingNode } from "./order-findings";

/**
 * The fixes the run's findings suggest, each once, in the findings' order:
 * a finding's fixes, then its causes', depth first, then the next
 * finding's. A fix is the same when it's the same catalog entry, as
 * `orderFindings` judges it: two findings share a fix by sharing the
 * catalog's one `Fix` object (`catalog/`).
 */
export function suggestedFixes({
  findings,
}: Pick<RunFindings, "findings">): Fix[] {
  return [...new Set(findings.flatMap(fixesBeneath))];
}

/** The node's fixes, then its causes', depth first, repeats included. */
function fixesBeneath(node: FindingNode): Fix[] {
  return [...node.finding.fixes, ...node.causes.flatMap(fixesBeneath)];
}
