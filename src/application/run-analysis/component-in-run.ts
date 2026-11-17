import type { RunFindings } from "./findings/find-run";
import type { Finding } from "./findings/finding";
import { sameKey } from "./findings/finding-key";
import { plural } from "./findings/message";
import type { FindingNode } from "./findings/order-findings";
import { componentStatuses } from "./component-status";
import { count } from "./number-format";
import { componentTotals } from "./run-totals";
import type { RunSoFar } from "./run-so-far";
import { STATUS_WORDS, type ComponentStatus } from "./status-words";

/** A run so far, what it found, and the component to read in it. */
export interface ComponentInRunInput {
  /** The run, with its own copy of the project (ADR-0018). */
  readonly run: RunSoFar;
  /** What `findRun` found in `run`. */
  readonly findings: RunFindings;
  readonly componentId: string;
  /** Whether the run is still going: its findings aren't shown until it stops. */
  readonly going: boolean;
}

/** A component's part of a run (UX design §9), or that it had none. */
export type ComponentInRun = ComponentRan | ComponentNotInRun;

/** A component the run's copy of the project has. */
export interface ComponentRan {
  readonly kind: "ran";
  /** Its status, as its badge and its Components row show it. */
  readonly status: ComponentStatus;
  /**
   * The status in the badge's word, with what it refused: "refused 28,841
   * attempts", "waited", or "ok".
   */
  readonly statusText: string;
  /**
   * The findings whose key names it, each once, in the order the run's
   * explanation lists them, causes included; none while the run goes.
   */
  readonly findings: readonly Finding[];
}

/** A component the run didn't have: one added since. */
export interface ComponentNotInRun {
  readonly kind: "not-in-run";
}

const NOT_IN_RUN: ComponentNotInRun = { kind: "not-in-run" };

/**
 * A component's part of the run so far: its status, from the same
 * `componentStatuses` as its badge, and the findings that name it, by the
 * rule that marks a box when a finding is selected (`key.componentId`).
 * A component the run's copy doesn't have wasn't in the run.
 */
export function componentInRun(input: ComponentInRunInput): ComponentInRun {
  const { run, componentId } = input;
  const status = componentStatuses(run).get(componentId);
  if (status === undefined) return NOT_IN_RUN;
  return {
    kind: "ran",
    status,
    statusText: STATUS_TEXTS[status](rejectedBy(run, componentId)),
    findings: input.going ? [] : findingsNaming(input.findings, componentId),
  };
}

/** Each status in words, from the count of attempts the component refused. */
const STATUS_TEXTS: Readonly<
  Record<ComponentStatus, (rejected: number) => string>
> = {
  // "attempts", as the findings count what a component refused.
  refused: (rejected) =>
    `${STATUS_WORDS.refused} ${count(rejected)} ${plural(rejected, ["attempt", "attempts"])}`,
  waited: () => STATUS_WORDS.waited,
  ok: () => STATUS_WORDS.ok,
};

/** How many attempts the component refused in the run so far. */
function rejectedBy(run: RunSoFar, componentId: string): number {
  const totals = componentTotals(run).find(({ id }) => id === componentId);
  return totals?.rejected ?? 0;
}

/**
 * The findings at the component, each once, depth first: a cause that
 * shows beneath several findings is listed where it's first met.
 */
function findingsNaming(
  { findings }: RunFindings,
  componentId: string,
): Finding[] {
  const naming: Finding[] = [];
  for (const finding of depthFirst(findings)) {
    const seen = naming.some((f) => sameKey(f.key, finding.key));
    if (finding.key.componentId === componentId && !seen) naming.push(finding);
  }
  return naming;
}

/** Every finding in the tree, each above its causes, in the tree's order. */
function depthFirst(nodes: readonly FindingNode[]): Finding[] {
  return nodes.flatMap(({ finding, causes }) => [
    finding,
    ...depthFirst(causes),
  ]);
}
