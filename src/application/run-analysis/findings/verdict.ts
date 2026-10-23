import { lookup } from "../../../domain/shared/kind-handlers";
import {
  allWorkflows,
  workflowTotals,
  type WorkflowTotals,
} from "../run-totals";
import { runFinished, type RunSoFar } from "../run-so-far";
import type { Finding, Severity } from "./finding";
import { headroom, type Headroom } from "./headroom";
import type { LimitRef } from "./limit-ref";
import { noHeadroom, type RefusingLimits } from "./no-headroom";
import type {
  ClosestToFailingStatement,
  NoHeadroomStatement,
  VerdictSummaryStatement,
} from "./verdict-phrases";

/**
 * What a run comes to, healthy runs included (findings.md §3.4). Always
 * present, before the findings.
 */
export interface Verdict {
  readonly level: VerdictLevel;
  /** Whether the run reached the end of its workload; if not, "so far". */
  readonly finished: boolean;
  /** The level in words, e.g. "Failing" or "Healthy so far". */
  readonly title: string;
  /** Over every workflow: started = succeeded + failed + inProgress. */
  readonly requests: WorkflowTotals;
  /** The request counts, as a statement. */
  readonly summary: VerdictSummaryStatement;
  /**
   * The refusing limits that ran out and refused work, though no request
   * failed: retried by callers or tried again by queues. Empty for a
   * failing run, whose failure findings name its limits.
   */
  readonly noHeadroom: readonly RefusingLimits[];
  /** `noHeadroom` as a statement, if it has any. */
  readonly noHeadroomLine: NoHeadroomStatement | undefined;
  /**
   * The limit closest to refusing work, among those not in `noHeadroom`.
   * Undefined for a failing run: a limit already refused, and the failure
   * findings name it.
   */
  readonly headroom: Headroom | undefined;
  /** `headroom` as a statement. */
  readonly headroomLine: ClosestToFailingStatement | undefined;
}

/**
 * - `failing`: some finding is a failure;
 * - `degraded`: none is, but some finding is a warning;
 * - `healthy`: neither.
 */
export type VerdictLevel = "failing" | "degraded" | "healthy";

/** The verdict for the run and every finding the detectors returned. */
export function verdictOf(
  run: RunSoFar,
  findings: readonly Finding[],
): Verdict {
  const level = levelOf(findings);
  const finished = runFinished(run);
  const requests = allWorkflows(workflowTotals(run));
  const refusing = level === "failing" ? [] : noHeadroom(run);
  const room =
    level === "failing" ? undefined : headroom(run, refsOf(refusing));
  return {
    level,
    finished,
    title: `${lookup(TITLES, level)}${finished ? "" : " so far"}`,
    requests,
    summary: {
      kind: "verdict-summary",
      level,
      finished,
      requests,
      warnings: findings.filter((f) => f.severity === "warning").length,
    },
    noHeadroom: refusing,
    noHeadroomLine: noHeadroomLine(refusing),
    headroom: room,
    headroomLine: headroomLine(room),
  };
}

const TITLES: Readonly<Record<VerdictLevel, string>> = {
  failing: "Failing",
  degraded: "Degraded",
  healthy: "Healthy",
};

/** The level a finding's severity sets, from the most severe down. */
const LEVELS: readonly (readonly [Severity, VerdictLevel])[] = [
  ["failure", "failing"],
  ["warning", "degraded"],
];

function levelOf(findings: readonly Finding[]): VerdictLevel {
  const severities = new Set(findings.map((f) => f.severity));
  return (
    LEVELS.find(([severity]) => severities.has(severity))?.[1] ?? "healthy"
  );
}

function noHeadroomLine(
  refusing: readonly RefusingLimits[],
): NoHeadroomStatement | undefined {
  if (refusing.length === 0) return undefined;
  return { kind: "no-headroom", refusing };
}

function headroomLine(
  room: Headroom | undefined,
): ClosestToFailingStatement | undefined {
  if (room === undefined) return undefined;
  return { kind: "closest-to-failing", headroom: room };
}

function refsOf(refusing: readonly RefusingLimits[]): LimitRef[] {
  return refusing.flatMap(({ componentId, limitNames }) =>
    limitNames.map((name) => ({ componentId, name })),
  );
}
