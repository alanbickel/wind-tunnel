import type { StepIssue, WorkloadIssue } from "../../domain/model/run-issue";
import {
  handleKind,
  type KindHandlers,
} from "../../domain/shared/kind-handlers";
import type { ComponentNames } from "../run-analysis/component-names";
import { listOf } from "../shared/list-of";

/** How the phrases name what an issue is about: by name, never by ID (UX §5). */
export interface RunIssueNames {
  readonly component: ComponentNames;
  /** A workflow's name, by ID; an ID the project doesn't have reads as itself. */
  readonly workflow: (workflowId: string) => string;
}

/**
 * One step issue, and the workflows that have it. The same issue in two
 * workflows (both call a removed component) is said once, naming both.
 */
export interface StepIssueGroup {
  readonly issue: StepIssue;
  /** At least one; in the order the workload's mix names them. */
  readonly workflowIds: readonly string[];
}

/**
 * A step issue as a sentence, e.g. "Get order and Create order call
 * orders-db from fn-orders, which has no edge to it."
 */
export function stepIssueText(
  group: StepIssueGroup,
  names: RunIssueNames,
): string {
  return handleKind(stepPhrases(group, names), group.issue);
}

/** A workload's own issue as a sentence, e.g. "The mix has no workflows." */
export function workloadIssueText(
  issue: WorkloadIssue,
  names: RunIssueNames,
): string {
  return handleKind(workloadPhrases(names), issue);
}

/** Each step issue's sentence, with its workflows as the subject. */
function stepPhrases(
  { workflowIds }: StepIssueGroup,
  names: RunIssueNames,
): KindHandlers<StepIssue, string> {
  const who = listOf(workflowIds.map(names.workflow));
  // "Get order calls", "Get order and Create order call".
  const verb = (singular: string) =>
    workflowIds.length > 1 ? singular.slice(0, -1) : singular;
  const name = names.component;
  return {
    // Once removed, a component has no name to give: the step keeps only
    // its id, which is never shown (UX design §2.4 step 5).
    "unknown-component": () =>
      `${who} ${verb("calls")} a component that isn't in the architecture any more.`,
    "missing-edge": ({ fromId, toId }) =>
      `${who} ${verb("calls")} ${name(toId)} from ${name(fromId)}, which has no edge to it.`,
    "action-not-accepted": ({ componentId, action, accepted }) =>
      `${who} ${verb("asks")} ${name(componentId)} to "${action}", but it accepts only ${listOf(accepted.map((a) => `"${a}"`))}.`,
    "async-not-on-enqueue": ({ action }) =>
      `${who} ${verb("gives")} async work to a "${action}" step; only "enqueue" steps can have it.`,
    "async-not-delivered": ({ componentId }) =>
      `${who} ${verb("gives")} ${name(componentId)} async work to deliver, but only queue-like components can deliver it.`,
  };
}

/** Each workload issue's sentence. */
function workloadPhrases(
  names: RunIssueNames,
): KindHandlers<WorkloadIssue, string> {
  return {
    "empty-mix": () => "The mix has no workflows.",
    "unknown-workflow": ({ workflowId }) =>
      `The mix names a workflow that isn't in the project: "${workflowId}".`,
    "repeated-workflow": ({ workflowId }) =>
      `The mix names ${names.workflow(workflowId)} more than once.`,
    "weight-not-positive": ({ workflowId, weight }) =>
      `The mix gives ${names.workflow(workflowId)} a weight of ${String(weight)}; weights must be positive.`,
    "empty-profile": () => "The profile has no points.",
    "profile-time-not-increasing": ({ atMs, previousAtMs }) =>
      `The profile's times must increase; ${seconds(atMs)} comes after ${seconds(previousAtMs)}.`,
    "negative-rate": ({ atMs, requestsPerSec }) =>
      `The profile's rate at ${seconds(atMs)} is ${String(requestsPerSec)} requests per second; rates can't be negative.`,
  };
}

/** A time in the seconds users enter, e.g. "10 s". */
function seconds(timeMs: number): string {
  return `${String(timeMs / 1000)} s`;
}
