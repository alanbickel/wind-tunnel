import type { DetectedFinding, Explains, Finding } from "./finding";
import { compareKeys, sameKey } from "./finding-key";

/**
 * Fills each finding's `causedBy` with the other findings that explain it
 * (findings.md §3.5): those whose `explains` names its component and, if
 * they name a limit, one of its `limitNames`. No detector knows another
 * exists, and the rules have no order. The keys are sorted, so the same
 * findings give the same result.
 */
export function linkCauses(findings: readonly DetectedFinding[]): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    causedBy: findings
      .filter(
        (cause) =>
          !sameKey(cause.key, finding.key) &&
          explainsIt(cause.explains, finding),
      )
      .map((cause) => cause.key)
      .sort(compareKeys),
  }));
}

function explainsIt(
  explains: Explains | undefined,
  finding: DetectedFinding,
): boolean {
  if (explains?.componentId !== finding.key.componentId) return false;
  return (
    explains.limitName === undefined ||
    finding.limitNames.includes(explains.limitName)
  );
}
